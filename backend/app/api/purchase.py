from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.core.database import get_db
from app.core.security import require_role
from app.models.purchase import Purchase
from app.models.user import UserRole
from app.schemas.purchase import PurchaseCreate, PurchaseOut, PurchasePaymentCreate
from app.services.purchase_service import create_purchase, record_purchase_payment

router = APIRouter(prefix="/purchases", tags=["purchases"])
# Reads open to any logged-in staff (production/counter may want to check
# what's on order); recording a purchase or a payment against one is
# Admin/Accounts only, same reasoning as the cash ledger.
write_roles = [Depends(require_role(UserRole.admin, UserRole.accounts))]


@router.get("/", response_model=List[PurchaseOut])
def get_purchases(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(Purchase).order_by(Purchase.id.desc()).offset(skip).limit(limit).all()


@router.get("/{purchase_id}", response_model=PurchaseOut)
def get_purchase(purchase_id: int, db: Session = Depends(get_db)):
    purchase = db.query(Purchase).filter(Purchase.id == purchase_id).first()
    if not purchase:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Purchase not found")
    return purchase


@router.post("/", response_model=PurchaseOut, status_code=status.HTTP_201_CREATED, dependencies=write_roles)
def post_purchase(data: PurchaseCreate, db: Session = Depends(get_db)):
    return create_purchase(db, data)


@router.post("/{purchase_id}/payments", response_model=PurchaseOut, dependencies=write_roles)
def post_purchase_payment(purchase_id: int, data: PurchasePaymentCreate, db: Session = Depends(get_db)):
    return record_purchase_payment(db, purchase_id, data)
