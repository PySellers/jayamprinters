from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.schemas.quotation import QuotationCreate, QuotationOut, QuotationStatusUpdate
from app.schemas.job_card import JobCardOut
from app.models.quotation import Quotation
from app.services.quotation_service import create_quotation
from app.services.job_card_service import convert_quotation_to_job_cards

router = APIRouter(prefix="/quotations")

@router.post("/", response_model=QuotationOut)
def create(payload: QuotationCreate, db: Session = Depends(get_db)):
    return create_quotation(db, payload)

@router.get("/", response_model=List[QuotationOut])
def list_quotations(db: Session = Depends(get_db)):
    return db.query(Quotation).order_by(Quotation.id.desc()).all()

@router.get("/{quotation_id}", response_model=QuotationOut)
def get_quotation(quotation_id: int, db: Session = Depends(get_db)):
    q = db.query(Quotation).filter(Quotation.id == quotation_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Quotation not found")
    return q

@router.patch("/{quotation_id}/status", response_model=QuotationOut)
def update_status(quotation_id: int, payload: QuotationStatusUpdate, db: Session = Depends(get_db)):
    q = db.query(Quotation).filter(Quotation.id == quotation_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Quotation not found")
    q.status = payload.status
    db.commit()
    db.refresh(q)
    return q

@router.post("/{quotation_id}/convert", response_model=List[JobCardOut])
def convert_to_job_cards(quotation_id: int, db: Session = Depends(get_db)):
    return convert_quotation_to_job_cards(db, quotation_id)

@router.delete("/{quotation_id}")
def delete_quotation(quotation_id: int, db: Session = Depends(get_db)):
    q = db.query(Quotation).filter(Quotation.id == quotation_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Quotation not found")
    db.delete(q)
    db.commit()
    return {"detail": "Deleted"}