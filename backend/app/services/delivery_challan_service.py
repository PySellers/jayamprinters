from datetime import date
from typing import Any, Dict, List

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.delivery_challan import DeliveryChallan
from app.models.job_card import JobCard
from app.schemas.delivery_challan import DeliveryChallanCreate, DeliveryChallanSave
from app.services.time_utils import today_ist


def financial_year_start(day: date) -> int:
    """April to March. 5 Apr 2026 -> 2026, 20 Feb 2027 -> 2026."""
    return day.year if day.month >= 4 else day.year - 1


def financial_year_label(fy: int) -> str:
    return f"{fy}-{str(fy + 1)[-2:]}"


def next_dc_number(db: Session, fy: int) -> int:
    highest = db.query(func.max(DeliveryChallan.dc_number)).filter(DeliveryChallan.financial_year == fy).scalar()
    return (highest or 0) + 1


def challan_to_dict(challan: DeliveryChallan) -> Dict[str, Any]:
    return {
        "id": challan.id,
        "financial_year": challan.financial_year,
        "financial_year_label": financial_year_label(challan.financial_year),
        "dc_number": challan.dc_number,
        "job_card_id": challan.job_card_id,
        "customer_id": challan.customer_id,
        "challan_date": challan.challan_date,
        "to_text": challan.to_text or "",
        "items": challan.items or [],
    }


def _get_job_card(db: Session, job_card_id: int) -> JobCard:
    job_card = db.query(JobCard).filter(JobCard.id == job_card_id).first()
    if not job_card:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job card not found")
    return job_card


def _prefill_to_text(job_card: JobCard) -> str:
    customer = job_card.customer
    if not customer:
        return ""
    lines = [customer.name]
    if customer.address:
        lines.append(customer.address)
    if customer.phone:
        lines.append(f"Ph: {customer.phone}")
    return "\n".join(lines[:3])


def _prefill_items(job_card: JobCard) -> List[Dict[str, str]]:
    item = job_card.quotation_item
    name = job_card.product.name if job_card.product else "Job"
    notes = (item.spec_notes if item and item.spec_notes else job_card.notes) or ""
    particulars = f"{name} - {notes}" if notes else name
    qty = str(item.quantity) if item and item.quantity else ""
    return [{"particulars": particulars, "qty": qty}]


def get_draft(db: Session, job_card_id: int) -> Dict[str, Any]:
    """Existing challan for the job card, or an unsaved draft.

    A draft shows the S.No. that *would* be given; the number is only really
    taken when the challan is saved, so opening the screen never burns a number."""
    job_card = _get_job_card(db, job_card_id)
    existing = db.query(DeliveryChallan).filter(DeliveryChallan.job_card_id == job_card_id).first()
    if existing:
        return challan_to_dict(existing)

    today = today_ist()
    fy = financial_year_start(today)
    return {
        "id": None,
        "financial_year": fy,
        "financial_year_label": financial_year_label(fy),
        "dc_number": next_dc_number(db, fy),
        "job_card_id": job_card.id,
        "customer_id": job_card.customer_id,
        "challan_date": today,
        "to_text": _prefill_to_text(job_card),
        "items": _prefill_items(job_card),
    }


def create_challan(db: Session, payload: DeliveryChallanCreate) -> DeliveryChallan:
    job_card = _get_job_card(db, payload.job_card_id)
    if db.query(DeliveryChallan).filter(DeliveryChallan.job_card_id == job_card.id).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This job card already has a delivery challan")

    # The challan date decides the financial year, so a challan dated in March
    # still belongs to the old year's sequence.
    fy = financial_year_start(payload.challan_date)
    for _ in range(5):  # retry if two people save at the same moment
        challan = DeliveryChallan(
            financial_year=fy,
            dc_number=next_dc_number(db, fy),
            job_card_id=job_card.id,
            customer_id=job_card.customer_id,
            challan_date=payload.challan_date,
            to_text=payload.to_text,
            items=[item.model_dump() for item in payload.items],
        )
        db.add(challan)
        try:
            db.commit()
            db.refresh(challan)
            return challan
        except IntegrityError:
            db.rollback()
    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Could not allocate a delivery challan number, please try again")


def update_challan(db: Session, challan_id: int, payload: DeliveryChallanSave) -> DeliveryChallan:
    challan = db.query(DeliveryChallan).filter(DeliveryChallan.id == challan_id).first()
    if not challan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Delivery challan not found")
    # The S.No. never changes once given, even if the date is edited into another year.
    challan.challan_date = payload.challan_date
    challan.to_text = payload.to_text
    challan.items = [item.model_dump() for item in payload.items]
    db.commit()
    db.refresh(challan)
    return challan