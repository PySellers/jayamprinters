from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.inventory import InventoryItem, StockMovement, StockMovementType
from app.schemas.inventory import StockAdjustmentCreate


def adjust_stock(db: Session, inventory_item_id: int, payload: StockAdjustmentCreate) -> InventoryItem:
    item = db.query(InventoryItem).filter(InventoryItem.id == inventory_item_id).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found")
    if payload.quantity == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Adjustment quantity cannot be zero")

    db.add(StockMovement(
        inventory_item_id=item.id,
        movement_type=StockMovementType.adjustment,
        quantity=payload.quantity,
        notes=payload.notes,
    ))
    item.current_stock += payload.quantity
    db.commit()
    db.refresh(item)
    return item
