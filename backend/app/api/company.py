from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from typing import List

from app.core.database import get_db
from app.core.security import require_role
from app.models.company import HsnCode
from app.models.user import UserRole
from app.schemas.company import CompanyOut, CompanyUpdate, HsnCreate, HsnOut, HsnUpdate
from app.services.company_service import get_company

admin_write = [Depends(require_role(UserRole.admin))]

company_router = APIRouter(prefix="/company", tags=["company"])
hsn_router = APIRouter(prefix="/hsn-codes", tags=["hsn"])


@company_router.get("/", response_model=CompanyOut)
def read_company(db: Session = Depends(get_db)):
    row = get_company(db)
    db.commit()
    return row


@company_router.put("/", response_model=CompanyOut, dependencies=admin_write)
def update_company(data: CompanyUpdate, db: Session = Depends(get_db)):
    row = get_company(db, lock=True)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


@hsn_router.get("/", response_model=List[HsnOut])
def list_hsn(db: Session = Depends(get_db)):
    return db.query(HsnCode).order_by(HsnCode.code).all()


@hsn_router.post("/", response_model=HsnOut, status_code=status.HTTP_201_CREATED, dependencies=admin_write)
def create_hsn(data: HsnCreate, db: Session = Depends(get_db)):
    if db.query(HsnCode.id).filter(HsnCode.code == data.code.strip()).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"HSN {data.code} already exists")
    row = HsnCode(**{**data.model_dump(), "code": data.code.strip()})
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@hsn_router.put("/{hsn_id}", response_model=HsnOut, dependencies=admin_write)
def update_hsn(hsn_id: int, data: HsnUpdate, db: Session = Depends(get_db)):
    row = db.query(HsnCode).filter(HsnCode.id == hsn_id).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="HSN code not found")
    updates = data.model_dump(exclude_unset=True)
    code = updates.get("code")
    if code and db.query(HsnCode.id).filter(HsnCode.code == code.strip(), HsnCode.id != hsn_id).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"HSN {code} already exists")
    for key, value in updates.items():
        setattr(row, key, value.strip() if key == "code" and value else value)
    db.commit()
    db.refresh(row)
    return row


@hsn_router.delete("/{hsn_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=admin_write)
def delete_hsn(hsn_id: int, db: Session = Depends(get_db)):
    row = db.query(HsnCode).filter(HsnCode.id == hsn_id).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="HSN code not found")
    db.delete(row)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This HSN code is used by a service or item. Point them at another code first, or switch it off.",
        )
    return None
