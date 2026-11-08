from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.job_card import JobCard
from app.models.job_proof import JobProof
from app.models.user import User
from app.services import proof_service

job_router = APIRouter(prefix="/job-cards", tags=["job-proofs"])
proof_router = APIRouter(prefix="/job-proofs", tags=["job-proofs"])


class ProofCreate(BaseModel):
    due_date: Optional[date] = None
    due_time: Optional[str] = None
    notes: Optional[str] = Field(default=None, max_length=500)
    handled_by: Optional[int] = None


class ProofUpdate(BaseModel):
    due_date: Optional[date] = None
    due_time: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = Field(default=None, max_length=500)
    handled_by: Optional[int] = None


def _job(db: Session, job_card_id: int) -> JobCard:
    job = db.query(JobCard).filter(JobCard.id == job_card_id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job card not found")
    return job


def _check_handler(db: Session, user_id: Optional[int]) -> None:
    if user_id is not None and not db.query(User.id).filter(User.id == user_id, User.is_active.is_(True)).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="That person is not an active user")


@job_router.get("/{job_card_id}/proofs")
def get_proofs(job_card_id: int, db: Session = Depends(get_db)):
    return proof_service.list_proofs(_job(db, job_card_id))


@job_router.post("/{job_card_id}/proofs", status_code=status.HTTP_201_CREATED)
def add_proof(job_card_id: int, data: ProofCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    job = _job(db, job_card_id)
    _check_handler(db, data.handled_by)
    proof = proof_service.add_proof(db, job, user, data.due_date, data.due_time, data.notes, data.handled_by)
    db.commit()
    db.refresh(proof)
    return proof_service.proof_view(proof)


@proof_router.put("/{proof_id}")
def update_proof(proof_id: int, data: ProofUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    proof = db.query(JobProof).filter(JobProof.id == proof_id).first()
    if not proof:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proof not found")
    changes = data.model_dump(exclude_unset=True)
    _check_handler(db, changes.get("handled_by"))
    proof_service.update_proof(db, proof, user, changes)
    db.commit()
    db.refresh(proof)
    return proof_service.proof_view(proof)


@proof_router.delete("/{proof_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_proof(proof_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    proof = db.query(JobProof).filter(JobProof.id == proof_id).first()
    if not proof:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proof not found")
    db.delete(proof)
    db.commit()
    return None
