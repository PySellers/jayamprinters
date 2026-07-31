from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.core.database import get_db
from app.core.security import require_roles
from app.models.purchase import Purchase
from app.models.user import UserRole
from app.schemas.purchase import PurchaseCreate, PurchaseOut
from app.services.purchase_service import create_purchase, delete_purchase

router = APIRouter(prefix="/purchases", tags=["purchases"])
accounts_only = [Depends(require_roles(UserRole.accounts, UserRole.admin))]


@router.get("/", response_model=List[PurchaseOut])
def get_purchases(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(Purchase).order_by(Purchase.id.desc()).offset(skip).limit(limit).all()


@router.get("/{purchase_id}", response_model=PurchaseOut)
def get_purchase(purchase_id: int, db: Session = Depends(get_db)):
    purchase = db.query(Purchase).filter(Purchase.id == purchase_id).first()
    if not purchase:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Purchase not found")
    return purchase


@router.post("/", response_model=PurchaseOut, status_code=status.HTTP_201_CREATED, dependencies=accounts_only)
def create_purchase_endpoint(data: PurchaseCreate, db: Session = Depends(get_db)):
    return create_purchase(db, data)


@router.delete("/{purchase_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=accounts_only)
def delete_purchase_endpoint(purchase_id: int, db: Session = Depends(get_db)):
    delete_purchase(db, purchase_id)
    return None
