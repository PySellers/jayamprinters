from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.core.database import get_db
from app.core.security import require_role
from app.models.job_card import JobCard
from app.models.job_card_comment import JobCardComment
from app.models.user import UserRole
from app.schemas.job_card import (
    JobCardCreate, JobCardUpdate, JobCardOut, JobCardStatusUpdate,
    JobCardCommentCreate, JobCardCommentOut,
)
from app.services.job_card_service import generate_job_number

router = APIRouter(prefix="/job-cards", tags=["job-cards"])
# Everyday job-card work (create, update status/assignment, add comments) stays
# open to any logged-in staff -- counter, production, and accounts all
# legitimately touch a job card during its life. Only deleting one outright is
# Admin-only, matching "cancel/update/delete orders" being an Admin power.
admin_only = [Depends(require_role(UserRole.admin))]


@router.get("/", response_model=List[JobCardOut])
def get_job_cards(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(JobCard).order_by(JobCard.id.desc()).offset(skip).limit(limit).all()


@router.get("/{job_card_id}", response_model=JobCardOut)
def get_job_card(job_card_id: int, db: Session = Depends(get_db)):
    job_card = db.query(JobCard).filter(JobCard.id == job_card_id).first()
    if not job_card:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job card not found")
    return job_card


@router.post("/", response_model=JobCardOut, status_code=status.HTTP_201_CREATED)
def create_job_card(data: JobCardCreate, db: Session = Depends(get_db)):
    job_card = JobCard(job_number=generate_job_number(db), **data.model_dump())
    db.add(job_card)
    db.commit()
    db.refresh(job_card)
    return job_card


@router.put("/{job_card_id}", response_model=JobCardOut)
def update_job_card(job_card_id: int, data: JobCardUpdate, db: Session = Depends(get_db)):
    job_card = db.query(JobCard).filter(JobCard.id == job_card_id).first()
    if not job_card:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job card not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(job_card, key, value)
    db.commit()
    db.refresh(job_card)
    return job_card


@router.patch("/{job_card_id}/status", response_model=JobCardOut)
def update_job_card_status(job_card_id: int, payload: JobCardStatusUpdate, db: Session = Depends(get_db)):
    job_card = db.query(JobCard).filter(JobCard.id == job_card_id).first()
    if not job_card:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job card not found")
    job_card.status = payload.status
    db.commit()
    db.refresh(job_card)
    return job_card


@router.delete("/{job_card_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=admin_only)
def delete_job_card(job_card_id: int, db: Session = Depends(get_db)):
    job_card = db.query(JobCard).filter(JobCard.id == job_card_id).first()
    if not job_card:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job card not found")
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
