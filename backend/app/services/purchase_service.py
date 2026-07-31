from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.inventory import InventoryItem, StockMovement, StockMovementType
from app.models.purchase import Purchase, PurchaseItem
from app.schemas.purchase import PurchaseCreate


def generate_purchase_number(db: Session) -> str:
    count = db.query(Purchase).count() + 1
    return f"PUR-{count:05d}"


def create_purchase(db: Session, data: PurchaseCreate) -> Purchase:
    """Creates the purchase and immediately receives it - stock is credited right away.

    There's no draft/pending-receipt workflow here on purpose: this records goods that have
    already arrived, not goods on order. If a purchase turns out to be wrong, delete_purchase
    reverses the stock it added rather than leaving current_stock out of sync.
    """
    subtotal = 0.0
    purchase = Purchase(
        purchase_number=generate_purchase_number(db),
        vendor_id=data.vendor_id,
        tax_amount=data.tax_amount,
        notes=data.notes,
    )
    if data.purchase_date is not None:
        purchase.purchase_date = data.purchase_date
    db.add(purchase)
    db.flush()

    for item_data in data.items:
        inventory_item = db.query(InventoryItem).filter(InventoryItem.id == item_data.inventory_item_id).first()
        if not inventory_item:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Inventory item {item_data.inventory_item_id} not found",
            )
        total_price = item_data.quantity * item_data.unit_price
        subtotal += total_price
        db.add(PurchaseItem(
            purchase_id=purchase.id,
            inventory_item_id=item_data.inventory_item_id,
            quantity=item_data.quantity,
            unit_price=item_data.unit_price,
            total_price=total_price,
        ))
        db.add(StockMovement(
            inventory_item_id=item_data.inventory_item_id,
            movement_type=StockMovementType.purchase_in,
            quantity=item_data.quantity,
            reference=purchase.purchase_number,
        ))
        inventory_item.current_stock += item_data.quantity

    purchase.subtotal = subtotal
    purchase.grand_total = subtotal + purchase.tax_amount
    db.commit()
    db.refresh(purchase)
    return purchase


def delete_purchase(db: Session, purchase_id: int) -> None:
    purchase = db.query(Purchase).filter(Purchase.id == purchase_id).first()
    if not purchase:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Purchase not found")

    for item in purchase.items:
        inventory_item = db.query(InventoryItem).filter(InventoryItem.id == item.inventory_item_id).first()
        if inventory_item:
            db.add(StockMovement(
                inventory_item_id=item.inventory_item_id,
                movement_type=StockMovementType.adjustment,
                quantity=-item.quantity,
                reference=purchase.purchase_number,
                notes=f"Reversal of deleted purchase {purchase.purchase_number}",
            ))
            inventory_item.current_stock -= item.quantity

    db.delete(purchase)
    db.commit()
