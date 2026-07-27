"""
Job Card creation is the first "sales document" in the Quotation -> Estimate ->
Job Card -> Delivery Challan -> Tax Invoice chain described in Section 5.1 of
the blueprint doc. It calls the SAME pricing resolver used for a plain /quotes
preview, so the price on the job card is guaranteed to match what the customer
was quoted -- a job is priced once and carried through every later document.

Per-stage staff attribution (dtp_by, machine_man_by, rubber_stamp_by,
numbering_by, binding_by, proof_verified_customer_by, proof_verified_press_by)
mirrors the rate-card PDF's own Home-page mockup, which lists each of those as
its own field next to the job.
"""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import JobCard, Party, ProductCategory, JobStage, Order
from app.pricing_engine import calculate_quote, PricingError
from app.schemas import (
    JobCardCreate, JobCardOut, JobStageUpdate, JobAssigneeUpdate, QuoteResponse,
    ReminderItem, ReminderList,
)

router = APIRouter(prefix="/jobs", tags=["jobs"])

# Only stages with an unambiguous single owner auto-fill from JobStageUpdate.assignee_name.
# "finishing" bundles rubber-stamp/numbering/binding -- use PATCH /jobs/{n}/assignee for those.
STAGE_FIELD_MAP = {
    JobStage.DTP: "dtp_by",
    JobStage.PRINTING: "machine_man_by",
    JobStage.PROOF_CUSTOMER: "proof_verified_customer_by",
    JobStage.PROOF_PRESS: "proof_verified_press_by",
}

ASSIGNEE_FIELDS = {
    "dtp_by", "machine_man_by", "rubber_stamp_by", "numbering_by",
    "binding_by", "proof_verified_customer_by", "proof_verified_press_by",
}


def _next_job_number(db: Session) -> str:
    count = db.query(JobCard).count()
    return f"JOB-{count + 1:05d}"


@router.get("", response_model=list[JobCardOut])
def list_jobs(db: Session = Depends(get_db)):
    jobs = db.query(JobCard).order_by(JobCard.id.desc()).all()
    return [_to_out(j, db) for j in jobs]


@router.get("/reminders", response_model=ReminderList)
def reminders(db: Session = Depends(get_db)):
    """Feeds the Home dashboard's reminder panel: overdue/due-soon deliveries
    and orders with an outstanding balance -- the PDF's 'blinking Delivery Date
    Time / Payment' indicator, computed instead of manually watched."""
    now = datetime.utcnow()
    soon_cutoff = now + timedelta(hours=24)
    items: list[ReminderItem] = []

    jobs = db.query(JobCard).filter(JobCard.stage != JobStage.DISPATCHED).all()
    for j in jobs:
        if j.delivery_due_at is None:
            continue
        category = db.query(ProductCategory).filter(ProductCategory.id == j.category_id).first()
        order = db.query(Order).filter(Order.id == j.order_id).first() if j.order_id else None
        reason = None
        if j.delivery_due_at < now:
            reason = "overdue"
        elif j.delivery_due_at <= soon_cutoff:
            reason = "due_soon"
        if reason:
            items.append(ReminderItem(
                job_number=j.job_number, order_number=order.order_number if order else None,
                category_code=category.code if category else "", party_name=j.party.name if j.party else None,
                stage=j.stage.value, delivery_due_at=j.delivery_due_at, reason=reason,
            ))

    orders = db.query(Order).all()
    for o in orders:
        items_of_order = db.query(JobCard).filter(JobCard.order_id == o.id).all()
        grand_total = sum((float(i.computed_total or 0) for i in items_of_order), 0.0)
        balance = grand_total - float(o.paid_amount or 0)
        if balance > 0.01 and o.status.value == "active":
            first_job = items_of_order[0] if items_of_order else None
            items.append(ReminderItem(
                job_number=first_job.job_number if first_job else o.order_number,
                order_number=o.order_number, category_code="order-level",
                party_name=o.party.name if o.party else None, stage="", delivery_due_at=None,
                reason="unpaid_balance", balance_due=round(balance, 2),
            ))

    return ReminderList(generated_at=now, items=items)


@router.get("/{job_number}", response_model=JobCardOut)
def get_job(job_number: str, db: Session = Depends(get_db)):
    job = db.query(JobCard).filter(JobCard.job_number == job_number).first()
    if job is None:
        raise HTTPException(status_code=404, detail=f"Unknown job '{job_number}'")
    return _to_out(job, db)


@router.post("", response_model=JobCardOut, status_code=201)
def create_job(payload: JobCardCreate, db: Session = Depends(get_db)):
    category = db.query(ProductCategory).filter(ProductCategory.code == payload.category_code).first()
    if category is None:
        raise HTTPException(status_code=404, detail=f"Unknown category '{payload.category_code}'")

    # Resolve or create the party
    party = None
    if payload.party_id is not None:
        party = db.query(Party).filter(Party.id == payload.party_id).first()
        if party is None:
            raise HTTPException(status_code=404, detail=f"Unknown party id {payload.party_id}")
    elif payload.party is not None:
        party = Party(**payload.party.model_dump())
        db.add(party)
        db.flush()

    try:
        quote = calculate_quote(
            db,
            category_code=payload.category_code,
            quantity=payload.quantity,
            selected_options=payload.selected_options,
            extra_codes=payload.extra_codes,
        )
    except PricingError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    job = JobCard(
        job_number=_next_job_number(db),
        party_id=party.id if party else None,
        category_id=category.id,
        quantity=payload.quantity,
        selected_options=payload.selected_options,
        selected_extra_codes=payload.extra_codes,
        computed_total=quote["total"],
        stage=JobStage.ORDER_TAKEN,
        order_taken_by=payload.order_taken_by,
        delivery_due_at=payload.delivery_due_at,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    out = _to_out(job, db)
    out.price_breakdown = QuoteResponse(**quote)
    return out


@router.patch("/{job_number}/stage", response_model=JobCardOut)
def update_stage(job_number: str, payload: JobStageUpdate, db: Session = Depends(get_db)):
    job = db.query(JobCard).filter(JobCard.job_number == job_number).first()
    if job is None:
        raise HTTPException(status_code=404, detail=f"Unknown job '{job_number}'")
    try:
        new_stage = JobStage(payload.stage)
    except ValueError:
        valid = [s.value for s in JobStage]
        raise HTTPException(status_code=400, detail=f"Invalid stage. Must be one of {valid}")
    job.stage = new_stage
    if payload.assignee_name:
        field = STAGE_FIELD_MAP.get(new_stage)
        if field:
            setattr(job, field, payload.assignee_name)
    db.commit()
    db.refresh(job)
    return _to_out(job, db)


@router.patch("/{job_number}/assignee", response_model=JobCardOut)
def update_assignee(job_number: str, payload: JobAssigneeUpdate, db: Session = Depends(get_db)):
    """Directly set one per-stage staff field, e.g. rubber_stamp_by, without
    necessarily moving the job's overall `stage`."""
    if payload.field not in ASSIGNEE_FIELDS:
        raise HTTPException(status_code=400, detail=f"field must be one of {sorted(ASSIGNEE_FIELDS)}")
    job = db.query(JobCard).filter(JobCard.job_number == job_number).first()
    if job is None:
        raise HTTPException(status_code=404, detail=f"Unknown job '{job_number}'")
    setattr(job, payload.field, payload.name)
    db.commit()
    db.refresh(job)
    return _to_out(job, db)


def _to_out(job: JobCard, db: Session):
    from app.schemas import JobCardOut, PartyOut  # local import avoids circularity at module load

    party_out = PartyOut.model_validate(job.party) if job.party else None
    category = db.query(ProductCategory).filter(ProductCategory.id == job.category_id).first()
    order = db.query(Order).filter(Order.id == job.order_id).first() if job.order_id else None
    return JobCardOut(
        id=job.id,
        job_number=job.job_number,
        order_number=order.order_number if order else None,
        party=party_out,
        category_code=category.code if category else "",
        quantity=job.quantity,
        selected_options=job.selected_options or {},
        selected_extra_codes=job.selected_extra_codes or [],
        computed_total=job.computed_total,
        stage=job.stage.value if hasattr(job.stage, "value") else job.stage,
        order_taken_by=job.order_taken_by,
        dtp_by=job.dtp_by,
        machine_man_by=job.machine_man_by,
        rubber_stamp_by=job.rubber_stamp_by,
        numbering_by=job.numbering_by,
        binding_by=job.binding_by,
        proof_verified_customer_by=job.proof_verified_customer_by,
        proof_verified_press_by=job.proof_verified_press_by,
        delivery_due_at=job.delivery_due_at,
        created_at=job.created_at,
    )
