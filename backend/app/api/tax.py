from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from typing import List

from app.core.database import get_db
from app.core.security import require_role
from app.models.masters import Tax
from app.models.user import UserRole
from app.schemas.masters import TaxCreate, TaxUpdate, TaxOut

router = APIRouter(prefix="/taxes", tags=["taxes"])
admin_write = [Depends(require_role(UserRole.admin))]


def _unset_other_defaults(db: Session, exclude_id: int = None):
    query = db.query(Tax).filter(Tax.is_default.is_(True))
    if exclude_id is not None:
        query = query.filter(Tax.id != exclude_id)
    query.update({Tax.is_default: False})


@router.get("/", response_model=List[TaxOut])
def get_taxes(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(Tax).offset(skip).limit(limit).all()


@router.get("/{tax_id}", response_model=TaxOut)
def get_tax(tax_id: int, db: Session = Depends(get_db)):
    tax = db.query(Tax).filter(Tax.id == tax_id).first()
    if not tax:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tax not found")
    return tax


@router.post("/", response_model=TaxOut, status_code=status.HTTP_201_CREATED, dependencies=admin_write)
def create_tax(data: TaxCreate, db: Session = Depends(get_db)):
    if data.is_default:
        _unset_other_defaults(db)
    tax = Tax(**data.model_dump())
    db.add(tax)
    db.commit()
    db.refresh(tax)
    return tax


@router.put("/{tax_id}", response_model=TaxOut, dependencies=admin_write)
def update_tax(tax_id: int, data: TaxUpdate, db: Session = Depends(get_db)):
    tax = db.query(Tax).filter(Tax.id == tax_id).first()
    if not tax:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tax not found")
    updates = data.model_dump(exclude_unset=True)
    if updates.get("is_default") is True:
        _unset_other_defaults(db, exclude_id=tax_id)
    for key, value in updates.items():
        setattr(tax, key, value)
    db.commit()
    db.refresh(tax)
    return tax


@router.delete("/{tax_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=admin_write)
def delete_tax(tax_id: int, db: Session = Depends(get_db)):
    tax = db.query(Tax).filter(Tax.id == tax_id).first()
    if not tax:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tax not found")
    db.delete(tax)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tax is in use, cannot delete")
    return None
