from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from typing import List, Optional

from app.core.database import get_db
from app.core.security import require_role
from app.models.purchase import InventoryItem
from app.models.user import UserRole
from app.schemas.purchase import InventoryItemCreate, InventoryItemUpdate, InventoryItemOut

router = APIRouter(prefix="/inventory", tags=["purchases"])
write_roles = [Depends(require_role(UserRole.admin, UserRole.accounts))]


def _to_out(item: InventoryItem) -> InventoryItemOut:
    qty = item.current_qty or 0.0
    return InventoryItemOut(
        id=item.id, name=item.name, unit=item.unit, current_qty=qty,
        reorder_threshold=item.reorder_threshold, notes=item.notes,
        customer_id=item.customer_id, customer_name=item.customer.name if item.customer is not None else None,
        low_stock=qty <= item.reorder_threshold,
        stock_state="empty" if qty <= 0 else ("low" if qty <= item.reorder_threshold else "ok"),
    )


@router.get("/", response_model=List[InventoryItemOut])
def get_inventory_items(customer_id: Optional[int] = None, db: Session = Depends(get_db)):
    query = db.query(InventoryItem)
    if customer_id is not None:
        query = query.filter(InventoryItem.customer_id == customer_id)
    return [_to_out(i) for i in query.order_by(InventoryItem.name).all()]


@router.get("/low-stock", response_model=List[InventoryItemOut])
def get_low_stock_items(db: Session = Depends(get_db)):
    """Everything at or under its reorder level (or empty): the shop's own stock only - a customer's own material is
    not something the shop buys."""
    items = db.query(InventoryItem).filter(InventoryItem.customer_id.is_(None)).all()
    return sorted((_to_out(i) for i in items if (i.current_qty or 0) <= i.reorder_threshold), key=lambda o: (o.current_qty, o.name))


@router.get("/{item_id}", response_model=InventoryItemOut)
def get_inventory_item(item_id: int, db: Session = Depends(get_db)):
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found")
    return _to_out(item)


@router.post("/", response_model=InventoryItemOut, status_code=status.HTTP_201_CREATED, dependencies=write_roles)
def create_inventory_item(data: InventoryItemCreate, db: Session = Depends(get_db)):
    existing = db.query(InventoryItem).filter(InventoryItem.name == data.name).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"'{data.name}' already exists")
    item = InventoryItem(**data.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return _to_out(item)


@router.put("/{item_id}", response_model=InventoryItemOut, dependencies=write_roles)
def update_inventory_item(item_id: int, data: InventoryItemUpdate, db: Session = Depends(get_db)):
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(item, key, value)
    db.commit()
    db.refresh(item)
    return _to_out(item)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=write_roles)
def delete_inventory_item(item_id: int, db: Session = Depends(get_db)):
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found")
    db.delete(item)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This item has purchase history linked to it, cannot delete")
    return None
