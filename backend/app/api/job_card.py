from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session
from typing import List

from app.core.database import get_db
from app.core.security import get_current_user, require_role
from app.models.job_card import JobCard
from app.models.job_card_comment import JobCardComment
from app.models.outsource import OutsourceJob
from app.models.user import User, UserRole
from app.schemas.job_card import (
    JobCardCreate, JobCardUpdate, JobCardOut, JobCardStatusUpdate,
    JobCardCommentCreate, JobCardCommentOut, JobCardSheetUpdate, JobCardSheetOut,
)
from app.services.job_card_service import generate_job_number, get_job_card_sheet, reset_job_card_sheet, save_job_card_sheet
from app.services import workflow_service as wf
from app.services import proof_service
from app.services.company_service import get_company
from app.services.job_card_detail_service import job_card_detail
from app.services.job_card_pdf_service import generate_job_card_pdf
from app.services.job_sheet_pdf_service import generate_job_sheet_pdf
from sqlalchemy.orm import joinedload

router = APIRouter(prefix="/job-cards", tags=["job-cards"])
# Everyday job-card work (create, update status/assignment, add comments) stays
# open to any logged-in staff -- counter, production, and accounts all
# legitimately touch a job card during its life. Only deleting one outright is
# Admin-only, matching "cancel/update/delete orders" being an Admin power.
admin_only = [Depends(require_role(UserRole.admin))]


def _out(job_card: JobCard) -> JobCardOut:
    out = JobCardOut.model_validate(job_card)
    for key, value in wf.job_summary(job_card).items():
        setattr(out, key, value)
    for key, value in proof_service.proofs_summary(job_card).items():
        setattr(out, key, value)
    out.quantity = job_card.quotation_item.quantity if job_card.quotation_item is not None else None
    return out


@router.get("/", response_model=List[JobCardOut])
def get_job_cards(skip: int = 0, limit: int = 5000, db: Session = Depends(get_db)):
    rows = (
        db.query(JobCard).options(joinedload(JobCard.steps), joinedload(JobCard.proofs), joinedload(JobCard.quotation_item))
        .order_by(JobCard.id.desc()).offset(skip).limit(limit).all()
    )
    return [_out(j) for j in rows]


@router.get("/{job_card_id}", response_model=JobCardOut)
def get_job_card(job_card_id: int, db: Session = Depends(get_db)):
    job_card = db.query(JobCard).filter(JobCard.id == job_card_id).first()
    if not job_card:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job card not found")
    return _out(job_card)


@router.post("/", response_model=JobCardOut, status_code=status.HTTP_201_CREATED)
def create_job_card(data: JobCardCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    job_card = JobCard(job_number=generate_job_number(db), **data.model_dump())
    db.add(job_card)
    db.flush()
    wf.create_steps_for_job(db, job_card, user)
    _assign_from_legacy_fields(db, job_card, user, designer=job_card.designer_id, operator=job_card.operator_id)
    db.commit()
    db.refresh(job_card)
    return _out(job_card)


def _assign_from_legacy_fields(db: Session, job_card: JobCard, user: User, designer=None, operator=None) -> None:
    """The old 'designer' / 'operator' boxes now also put that person on the design / printing step."""
    if designer is None and operator is None:
        return
    if not job_card.steps:
        wf.create_steps_for_job(db, job_card, user, log_event=False)
    for step in sorted(job_card.steps, key=lambda s: s.position):
        if step.status in ("done", "skipped"):
            continue
        wanted = designer if step.stage == "design" else operator if step.stage == "printing" else None
        if wanted is not None and step.assigned_to != wanted:
            step.assigned_to = wanted
            wf.log(db, job_card, step, user, "assigned", f"{step.name} (from the job card's designer / operator)")


@router.put("/{job_card_id}", response_model=JobCardOut)
def update_job_card(job_card_id: int, data: JobCardUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    job_card = db.query(JobCard).filter(JobCard.id == job_card_id).first()
    if not job_card:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job card not found")
    changes = data.model_dump(exclude_unset=True)
    for key, value in changes.items():
        setattr(job_card, key, value)
    _assign_from_legacy_fields(db, job_card, user, designer=changes.get("designer_id"), operator=changes.get("operator_id"))
    db.commit()
    db.refresh(job_card)
    return _out(job_card)


@router.get("/{job_card_id}/detail")
def read_job_card_detail(job_card_id: int, with_price: bool = True, db: Session = Depends(get_db)):
    """The job card built from the order: every choice made for the job, live status, proofs and production steps."""
    job_card = db.query(JobCard).filter(JobCard.id == job_card_id).first()
    if not job_card:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job card not found")
    return job_card_detail(db, job_card, with_price)


@router.get("/{job_card_id}/pdf")
def job_card_pdf(job_card_id: int, with_price: bool = False, db: Session = Depends(get_db)):
    """Printable job card with the status as it is right now, with or without prices."""
    job_card = db.query(JobCard).filter(JobCard.id == job_card_id).first()
    if not job_card:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job card not found")
    pdf = generate_job_card_pdf(job_card_detail(db, job_card, with_price), get_company(db))
    suffix = "with-price" if with_price else "no-price"
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="{job_card.job_number}-{suffix}.pdf"'})


@router.get("/{job_card_id}/sheet-pdf")
def job_sheet_pdf(job_card_id: int, with_price: bool = False, db: Session = Depends(get_db)):
    """The paper job card (landscape A4), with only the parts that belong to the job's service, filled from the order
    and whatever staff saved on the form. with_price adds the payment column and the price list."""
    job_card = db.query(JobCard).filter(JobCard.id == job_card_id).first()
    if not job_card:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job card not found")
    pdf = generate_job_sheet_pdf(get_job_card_sheet(db, job_card), get_company(db), with_price)
    suffix = "paper-card-with-price" if with_price else "paper-card"
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="{job_card.job_number}-{suffix}.pdf"'})


@router.get("/{job_card_id}/sheet", response_model=JobCardSheetOut)
def read_job_card_sheet(job_card_id: int, db: Session = Depends(get_db)):
    """The paper job card: saved content over defaults from the order."""
    job_card = db.query(JobCard).filter(JobCard.id == job_card_id).first()
    if not job_card:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job card not found")
    return get_job_card_sheet(db, job_card)


@router.put("/{job_card_id}/sheet", response_model=JobCardSheetOut)
def write_job_card_sheet(job_card_id: int, data: JobCardSheetUpdate, db: Session = Depends(get_db)):
    job_card = db.query(JobCard).filter(JobCard.id == job_card_id).first()
    if not job_card:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job card not found")
    return save_job_card_sheet(db, job_card, data.sheet)


@router.post("/{job_card_id}/sheet/reset", response_model=JobCardSheetOut)
def reset_job_card_sheet_route(job_card_id: int, db: Session = Depends(get_db)):
    """Back to the form as the order fills it in (forgets what was typed by hand)."""
    job_card = db.query(JobCard).filter(JobCard.id == job_card_id).first()
    if not job_card:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job card not found")
    return reset_job_card_sheet(db, job_card)


@router.patch("/{job_card_id}/status", response_model=JobCardOut)
def update_job_card_status(job_card_id: int, payload: JobCardStatusUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    job_card = db.query(JobCard).filter(JobCard.id == job_card_id).first()
    if not job_card:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job card not found")
    wf.override_status(db, job_card, payload.status.value, user)
    db.commit()
    db.refresh(job_card)
    return _out(job_card)


@router.delete("/{job_card_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=admin_only)
def delete_job_card(job_card_id: int, db: Session = Depends(get_db)):
    job_card = db.query(JobCard).filter(JobCard.id == job_card_id).first()
    if not job_card:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job card not found")
    # work already sent to an outside company stays on record, it just loses its link to this job card
    db.query(OutsourceJob).filter(OutsourceJob.job_card_id == job_card_id).update({OutsourceJob.job_card_id: None})
    db.delete(job_card)
    db.commit()
    return None


@router.get("/{job_card_id}/comments", response_model=List[JobCardCommentOut])
def get_job_card_comments(job_card_id: int, db: Session = Depends(get_db)):
    job_card = db.query(JobCard).filter(JobCard.id == job_card_id).first()
    if not job_card:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job card not found")
    return (
        db.query(JobCardComment)
        .filter(JobCardComment.job_card_id == job_card_id)
        .order_by(JobCardComment.created_at.asc())
        .all()
    )


@router.post("/{job_card_id}/comments", response_model=JobCardCommentOut, status_code=status.HTTP_201_CREATED)
def create_job_card_comment(job_card_id: int, data: JobCardCommentCreate, db: Session = Depends(get_db)):
    job_card = db.query(JobCard).filter(JobCard.id == job_card_id).first()
    if not job_card:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job card not found")
    comment = JobCardComment(job_card_id=job_card_id, **data.model_dump())
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return comment