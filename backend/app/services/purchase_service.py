from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.purchase import Purchase, PurchaseItem, PurchasePayment, PurchaseStatus, InventoryItem, Vendor
from app.schemas.purchase import PurchaseCreate, PurchasePaymentCreate


def generate_purchase_number(db: Session) -> str:
    count = db.query(Purchase).count() + 1
    return f"PUR-{count:05d}"


def create_purchase(db: Session, payload: PurchaseCreate) -> Purchase:
    vendor = db.query(Vendor).filter(Vendor.id == payload.vendor_id).first()
    if not vendor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found")
    if not payload.items:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A purchase needs at least one item")

    purchase = Purchase(
        purchase_number=generate_purchase_number(db),
        vendor_id=payload.vendor_id,
        purchase_date=payload.purchase_date,
        notes=payload.notes,
        status=PurchaseStatus.unpaid,
    )
    db.add(purchase)
    db.flush()

    total = 0.0
    for line in payload.items:
        item = db.query(InventoryItem).filter(InventoryItem.id == line.inventory_item_id).first()
        if not item:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Inventory item {line.inventory_item_id} not found")
        line_total = line.quantity * line.unit_price
        total += line_total
        db.add(PurchaseItem(
            purchase_id=purchase.id, inventory_item_id=line.inventory_item_id,
            quantity=line.quantity, unit_price=line.unit_price, total_price=line_total,
        ))
        # Stock update: receiving a purchase is what brings material INTO the
        # shop, so quantity goes up here. Consumption/wastage adjustments are
        # a separate, manual InventoryItem edit (see inventory.py) rather than
        # tied to any specific job -- this app doesn't track bill-of-materials
        # per product, only a running stock level.
        item.current_qty = (item.current_qty or 0.0) + line.quantity

    purchase.total_amount = total
    db.commit()
    db.refresh(purchase)
    return purchase


def _recompute_purchase_status(db: Session, purchase: Purchase) -> None:
    total_paid = sum(p.amount for p in purchase.payments)
    purchase.paid_amount = total_paid
    if total_paid <= 0:
        purchase.status = PurchaseStatus.unpaid
    elif total_paid >= purchase.total_amount:
        purchase.status = PurchaseStatus.paid
    else:
        purchase.status = PurchaseStatus.partially_paid
    db.commit()
    db.refresh(purchase)


def record_purchase_payment(db: Session, purchase_id: int, payload: PurchasePaymentCreate) -> Purchase:
    purchase = db.query(Purchase).filter(Purchase.id == purchase_id).first()
    if not purchase:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Purchase not found")
    if payload.amount <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Payment amount must be positive")

    db.add(PurchasePayment(purchase_id=purchase.id, **payload.model_dump()))
    db.commit()
    db.refresh(purchase)
    _recompute_purchase_status(db, purchase)
    return purchase
