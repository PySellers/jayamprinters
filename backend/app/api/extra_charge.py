from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional

from app.core.database import get_db
from app.core.security import require_role
from app.models.extra_charge import ExtraCharge
from app.models.user import UserRole
from app.schemas.extra_charge import ExtraChargeCreate, ExtraChargeUpdate, ExtraChargeOut

router = APIRouter(prefix="/extra-charges", tags=["extra-charges"])
admin_write = [Depends(require_role(UserRole.admin))]


@router.get("/", response_model=List[ExtraChargeOut])
def get_extra_charges(category_id: Optional[int] = None, db: Session = Depends(get_db)):
    query = db.query(ExtraCharge)
    if category_id is not None:
        query = query.filter(
            (ExtraCharge.category_id == category_id) | (ExtraCharge.category_id.is_(None))
        )
    return query.all()


@router.get("/{charge_id}", response_model=ExtraChargeOut)
def get_extra_charge(charge_id: int, db: Session = Depends(get_db)):
    charge = db.query(ExtraCharge).filter(ExtraCharge.id == charge_id).first()
    if not charge:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Extra charge not found")
    return charge


@router.post("/", response_model=ExtraChargeOut, status_code=status.HTTP_201_CREATED, dependencies=admin_write)
def create_extra_charge(data: ExtraChargeCreate, db: Session = Depends(get_db)):
    charge = ExtraCharge(**data.model_dump())
    db.add(charge)
    db.commit()
    db.refresh(charge)
    return charge


@router.put("/{charge_id}", response_model=ExtraChargeOut, dependencies=admin_write)
def update_extra_charge(charge_id: int, data: ExtraChargeUpdate, db: Session = Depends(get_db)):
    charge = db.query(ExtraCharge).filter(ExtraCharge.id == charge_id).first()
    if not charge:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Extra charge not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(charge, key, value)
    db.commit()
    db.refresh(charge)
    return charge


@router.delete("/{charge_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=admin_write)
def delete_extra_charge(charge_id: int, db: Session = Depends(get_db)):
    charge = db.query(ExtraCharge).filter(ExtraCharge.id == charge_id).first()
    if not charge:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Extra charge not found")
    db.delete(charge)
    db.commit()
    return None
