from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.core.database import get_db
from app.models.delivery_challan import DeliveryChallan
from app.schemas.delivery_challan import DeliveryChallanCreate, DeliveryChallanOut
from app.services.delivery_challan_service import create_delivery_challan

router = APIRouter(prefix="/delivery-challans", tags=["delivery-challans"])


@router.get("/", response_model=List[DeliveryChallanOut])
def get_delivery_challans(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(DeliveryChallan).order_by(DeliveryChallan.id.desc()).offset(skip).limit(limit).all()


@router.get("/{challan_id}", response_model=DeliveryChallanOut)
def get_delivery_challan(challan_id: int, db: Session = Depends(get_db)):
    challan = db.query(DeliveryChallan).filter(DeliveryChallan.id == challan_id).first()
    if not challan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Delivery challan not found")
    return challan


@router.post("/", response_model=DeliveryChallanOut, status_code=status.HTTP_201_CREATED)
def create_delivery_challan_endpoint(data: DeliveryChallanCreate, db: Session = Depends(get_db)):
    return create_delivery_challan(db, data)
