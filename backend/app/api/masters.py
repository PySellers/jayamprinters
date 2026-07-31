from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from typing import List

from app.core.database import get_db
from app.core.security import require_roles
from app.models.masters import PrintingType, Machine
from app.models.user import UserRole
from app.schemas.masters import (
    PrintingTypeCreate, PrintingTypeUpdate, PrintingTypeOut,
    MachineCreate, MachineUpdate, MachineOut,
)

admin_only = [Depends(require_roles(UserRole.admin))]


def make_master_router(model, create_schema, update_schema, out_schema, prefix, tag):
    router = APIRouter(prefix=prefix, tags=[tag])

    @router.get("/", response_model=List[out_schema])
    def list_items(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
        return db.query(model).offset(skip).limit(limit).all()

    @router.get("/{item_id}", response_model=out_schema)
    def get_item(item_id: int, db: Session = Depends(get_db)):
        item = db.query(model).filter(model.id == item_id).first()
        if not item:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{tag} not found")
        return item

    @router.post("/", response_model=out_schema, status_code=status.HTTP_201_CREATED, dependencies=admin_only)
    def create_item(data: create_schema, db: Session = Depends(get_db)):
        item = model(**data.model_dump())
        db.add(item)
        db.commit()
        db.refresh(item)
        return item

    @router.put("/{item_id}", response_model=out_schema, dependencies=admin_only)
    def update_item(item_id: int, data: update_schema, db: Session = Depends(get_db)):
        item = db.query(model).filter(model.id == item_id).first()
        if not item:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{tag} not found")
        for key, value in data.model_dump(exclude_unset=True).items():
            setattr(item, key, value)
        db.commit()
        db.refresh(item)
        return item

    @router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=admin_only)
    def delete_item(item_id: int, db: Session = Depends(get_db)):
        item = db.query(model).filter(model.id == item_id).first()
        if not item:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{tag} not found")
        db.delete(item)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{tag} is in use, cannot delete")
        return None

    return router


router = APIRouter()
router.include_router(make_master_router(PrintingType, PrintingTypeCreate, PrintingTypeUpdate, PrintingTypeOut, "/printing-types", "printing-types"))
router.include_router(make_master_router(Machine, MachineCreate, MachineUpdate, MachineOut, "/machines", "machines"))
