from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.delivery_challan import DeliveryChallan
from app.models.invoice import Invoice
from app.schemas.delivery_challan import DeliveryChallanCreate


def generate_challan_number(db: Session) -> str:
    count = db.query(DeliveryChallan).count() + 1
    return f"DC-{count:05d}"


def create_delivery_challan(db: Session, data: DeliveryChallanCreate) -> DeliveryChallan:
    invoice = db.query(Invoice).filter(Invoice.id == data.invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")

    challan = DeliveryChallan(
        challan_number=generate_challan_number(db),
        invoice_id=data.invoice_id,
        bill_type=data.bill_type,
        vehicle_number=data.vehicle_number,
        transporter_name=data.transporter_name,
        notes=data.notes,
    )
    if data.delivery_date is not None:
        challan.delivery_date = data.delivery_date
    db.add(challan)
    db.commit()
    db.refresh(challan)
    return challan
