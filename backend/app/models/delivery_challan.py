import enum
from datetime import datetime

from sqlalchemy import Column, Date, DateTime, Enum, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.core.database import Base


class DeliveryChallanBillType(str, enum.Enum):
    cash_bill = "cash_bill"
    tax_gst_bill = "tax_gst_bill"


class DeliveryChallan(Base):
    """Accompanies goods out for delivery - references an invoice for item/pricing detail,
    since this shop always invoices before or at the point of delivery."""
    __tablename__ = "delivery_challans"

    id = Column(Integer, primary_key=True, index=True)
    challan_number = Column(String, unique=True, index=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id"), nullable=False)
    bill_type = Column(Enum(DeliveryChallanBillType), default=DeliveryChallanBillType.cash_bill, nullable=False)
    vehicle_number = Column(String, nullable=True)
    transporter_name = Column(String, nullable=True)
    delivery_date = Column(Date, default=lambda: datetime.utcnow().date())
    notes = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    invoice = relationship("Invoice")
