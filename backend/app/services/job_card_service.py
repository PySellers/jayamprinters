from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from app.services.numbering import next_number
from typing import List

from datetime import date
from typing import Any, Dict

from app.models.quotation import Quotation, QuotationStatus
from app.models.job_card import JobCard, JobCardPriority
from app.models.invoice import Invoice
from app.models.delivery_challan import DeliveryChallan
from app.services.time_utils import utc_naive_to_ist
from app.services.workflow_service import create_steps_for_job
from app.services.proof_service import create_proofs_from_order
from app.services.job_sheet_service import merge_saved, prefilled_sheet


def generate_job_number(db: Session) -> str:
    return next_number(db, JobCard.job_number, "JC")


def convert_quotation_to_job_cards(db: Session, quotation_id: int) -> List[JobCard]:
    quotation = db.query(Quotation).filter(Quotation.id == quotation_id).first()
    if not quotation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quotation not found")
    if quotation.status == QuotationStatus.converted:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Quotation already converted to job cards")

    job_cards = []
    for item in quotation.items:
        job_card = JobCard(
            job_number=generate_job_number(db),
            quotation_item_id=item.id,
            customer_id=quotation.customer_id,
            product_id=item.product_id,
            notes=item.spec_notes,
            delivery_date=quotation.delivery_date,
            priority=JobCardPriority(quotation.priority) if quotation.priority in [p.value for p in JobCardPriority] else JobCardPriority.medium,
        )
        db.add(job_card)
        db.flush()
        create_steps_for_job(db, job_card, log_event=True)
        create_proofs_from_order(db, job_card, quotation)
        job_cards.append(job_card)

    quotation.status = QuotationStatus.converted
    db.commit()
    for job_card in job_cards:
        db.refresh(job_card)
    return job_cards


# ---------------------------------------------------------------------------
# Paper job card ("sheet")
# ---------------------------------------------------------------------------
PAYMENT_KEYS = ["first", "rate", "advance", "balance1", "ap_advance", "balance2",
                "dtp", "proof", "printing", "binding", "packing", "delivery"]


def _iso(value) -> str:
    return value.isoformat() if value else ""


def _default_sheet(job_card: JobCard) -> Dict[str, Any]:
    item = job_card.quotation_item
    quotation = item.quotation if item else None
    return {
        "party_name": job_card.customer.name if job_card.customer else "",
        "mobile": (job_card.customer.phone or "") if job_card.customer else "",
        "job_name": job_card.product.name if job_card.product else "",
        "size": "",
        "type_of_printing": [],
        "proof1_date": _iso(quotation.proof1_date) if quotation else "",
        "proof1_time": (quotation.proof1_time or "") if quotation else "",
        "proof2_date": _iso(quotation.proof2_date) if quotation else "",
        "proof2_time": (quotation.proof2_time or "") if quotation else "",
        "delivery_date": _iso(job_card.delivery_date or (quotation.delivery_date if quotation else None)),
        "delivery_time": (quotation.delivery_time or "") if quotation else "",
        "paper": [
            {"range": "", "kgs": "", "colour": "",
             "qty": str(item.quantity) if (item and idx == 0 and item.quantity) else "",
             "printing": ""}
            for idx in range(4)
        ],
        "cutting_size": "",
        "printing_colours": [],
        "margins": [],
        "serial_from_to": "",
        "book_from_to": "",
        "payment": {key: "" for key in PAYMENT_KEYS},
        "remarks": job_card.notes or "",
        "job_position": [],
    }


def get_job_card_sheet(db: Session, job_card: JobCard) -> Dict[str, Any]:
    """Saved sheet content layered over defaults pulled from the order,
    plus the read-only header (invoice number / date / time, DC number)."""
    item = job_card.quotation_item
    quotation = item.quotation if item else None
    invoice = db.query(Invoice).filter(Invoice.quotation_id == quotation.id).first() if quotation else None
    challan = db.query(DeliveryChallan).filter(DeliveryChallan.job_card_id == job_card.id).first()

    # the form is pre-filled from the order and the job's progress; whatever staff saved on it wins
    sheet = merge_saved(prefilled_sheet(db, job_card), job_card.sheet_data)

    return {
        "job_card_id": job_card.id,
        "job_number": job_card.job_number,
        "invoice_number": invoice.invoice_number if invoice else None,
        "invoice_date": invoice.invoice_date if invoice else None,
        "invoice_time": utc_naive_to_ist(invoice.created_at).strftime("%I:%M %p") if invoice and invoice.created_at else None,
        "dc_number": challan.dc_number if challan else None,
        "sheet": sheet,
    }


def _only_changes(base: Dict[str, Any], sheet: Dict[str, Any]) -> Dict[str, Any]:
    """Keeps just what staff changed. Cells left as the order filled them keep following the order
    (price, payments received, proof dates, status ticks ...) instead of being frozen at the moment of saving."""
    kept: Dict[str, Any] = {}
    for key, value in sheet.items():
        if key == "paper" and isinstance(value, list):
            rows = []
            for index, row in enumerate(value):
                ref = base["paper"][index] if index < len(base["paper"]) else {}
                rows.append({c: v for c, v in (row or {}).items() if str(v or "") != str(ref.get(c) or "")})
            if any(rows):
                kept["paper"] = rows
        elif key == "payment" and isinstance(value, dict):
            changed = {c: v for c, v in value.items() if str(v or "") != str(base["payment"].get(c) or "")}
            if changed:
                kept["payment"] = changed
        elif key == "job_position" and isinstance(value, list):
            extra = [v for v in value if v not in base["job_position"]]
            if extra:
                kept[key] = extra
        elif value != base.get(key):
            kept[key] = value
    return kept


def save_job_card_sheet(db: Session, job_card: JobCard, sheet: Dict[str, Any]) -> Dict[str, Any]:
    job_card.sheet_data = _only_changes(prefilled_sheet(db, job_card), sheet)
    # Keep the list-page "Delivery" column in step with the delivery date on the sheet.
    raw_delivery = sheet.get("delivery_date")
    if raw_delivery:
        try:
            job_card.delivery_date = date.fromisoformat(str(raw_delivery))
        except ValueError:
            pass
    db.commit()
    db.refresh(job_card)
    return get_job_card_sheet(db, job_card)


def reset_job_card_sheet(db: Session, job_card: JobCard) -> Dict[str, Any]:
    """Throws away what was typed on the form, so it is filled from the order again."""
    job_card.sheet_data = None
    db.commit()
    db.refresh(job_card)
    return get_job_card_sheet(db, job_card)
