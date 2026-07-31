from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from typing import List

from app.core.database import get_db
from app.core.security import require_roles
from app.models.inventory import InventoryItem, StockMovement
from app.models.user import UserRole
from app.schemas.inventory import (
    InventoryItemCreate, InventoryItemOut, InventoryItemUpdate,
    StockAdjustmentCreate, StockMovementOut,
)
from app.services.inventory_service import adjust_stock

router = APIRouter(prefix="/inventory-items", tags=["inventory"])
admin_only = [Depends(require_roles(UserRole.admin))]
accounts_only = [Depends(require_roles(UserRole.accounts, UserRole.admin))]


@router.get("/", response_model=List[InventoryItemOut])
def get_inventory_items(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(InventoryItem).offset(skip).limit(limit).all()


@router.get("/{item_id}", response_model=InventoryItemOut)
def get_inventory_item(item_id: int, db: Session = Depends(get_db)):
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found")
    return item


@router.post("/", response_model=InventoryItemOut, status_code=status.HTTP_201_CREATED, dependencies=admin_only)
def create_inventory_item(data: InventoryItemCreate, db: Session = Depends(get_db)):
    item = InventoryItem(**data.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.put("/{item_id}", response_model=InventoryItemOut, dependencies=admin_only)
def update_inventory_item(item_id: int, data: InventoryItemUpdate, db: Session = Depends(get_db)):
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(item, key, value)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=admin_only)
def delete_inventory_item(item_id: int, db: Session = Depends(get_db)):
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found")
    db.delete(item)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Inventory item is in use, cannot delete")
    return None


@router.post("/{item_id}/adjust", response_model=InventoryItemOut, dependencies=accounts_only)
def adjust_inventory_item_stock(item_id: int, data: StockAdjustmentCreate, db: Session = Depends(get_db)):
    return adjust_stock(db, item_id, data)


@router.get("/{item_id}/movements", response_model=List[StockMovementOut])
def get_inventory_item_movements(item_id: int, db: Session = Depends(get_db)):
    return (
        db.query(StockMovement)
        .filter(StockMovement.inventory_item_id == item_id)
        .order_by(StockMovement.created_at.desc())
        .all()
    )
