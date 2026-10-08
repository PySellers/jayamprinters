from typing import List

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.delivery_challan import DeliveryChallan
from app.schemas.delivery_challan import DeliveryChallanCreate, DeliveryChallanOut, DeliveryChallanSave
from app.services.challan_pdf_service import generate_challan_pdf
from app.services.delivery_challan_service import challan_to_dict, create_challan, get_draft, update_challan

router = APIRouter(prefix="/delivery-challans", tags=["delivery-challans"])


@router.get("/", response_model=List[DeliveryChallanOut])
def list_challans(db: Session = Depends(get_db)):
    challans = db.query(DeliveryChallan).order_by(DeliveryChallan.id.desc()).all()
    return [challan_to_dict(c) for c in challans]


@router.get("/draft/{job_card_id}", response_model=DeliveryChallanOut)
def challan_draft(job_card_id: int, db: Session = Depends(get_db)):
    """The job card's challan if it has one, otherwise an unsaved draft (S.No. is a preview)."""
    return get_draft(db, job_card_id)


@router.post("/", response_model=DeliveryChallanOut, status_code=status.HTTP_201_CREATED)
def save_new_challan(payload: DeliveryChallanCreate, db: Session = Depends(get_db)):
    return challan_to_dict(create_challan(db, payload))


@router.put("/{challan_id}", response_model=DeliveryChallanOut)
def save_challan(challan_id: int, payload: DeliveryChallanSave, db: Session = Depends(get_db)):
    return challan_to_dict(update_challan(db, challan_id, payload))


@router.get("/{challan_id}/pdf")
def challan_pdf(challan_id: int, db: Session = Depends(get_db)):
    challan = db.query(DeliveryChallan).filter(DeliveryChallan.id == challan_id).first()
    if not challan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Delivery challan not found")
    return Response(
        content=generate_challan_pdf(challan),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="DC-{challan.financial_year}-{challan.dc_number}.pdf"'},
    )