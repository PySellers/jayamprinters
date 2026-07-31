import enum
from datetime import datetime

from sqlalchemy import Column, Date, DateTime, Enum, Float, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.invoice import ChequeStatus, PaymentMethod


class PurchasePaymentStatus(str, enum.Enum):
    unpaid = "unpaid"
    partially_paid = "partially_paid"
    paid = "paid"


class Purchase(Base):
    __tablename__ = "purchases"

    id = Column(Integer, primary_key=True, index=True)
    purchase_number = Column(String, unique=True, index=True)
    vendor_id = Column(Integer, ForeignKey("vendors.id"), nullable=False)
    purchase_date = Column(Date, default=lambda: datetime.utcnow().date())
    subtotal = Column(Float, default=0.0)
    tax_amount = Column(Float, default=0.0)
    grand_total = Column(Float, default=0.0)
    amount_paid = Column(Float, default=0.0, nullable=False, server_default="0")
    status = Column(Enum(PurchasePaymentStatus), default=PurchasePaymentStatus.unpaid, nullable=False, server_default=PurchasePaymentStatus.unpaid.value)
    notes = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    vendor = relationship("Vendor")
    items = relationship("PurchaseItem", back_populates="purchase", cascade="all, delete-orphan")
    payments = relationship("PurchasePayment", back_populates="purchase", cascade="all, delete-orphan")


class PurchaseItem(Base):
    __tablename__ = "purchase_items"

    id = Column(Integer, primary_key=True, index=True)
    purchase_id = Column(Integer, ForeignKey("purchases.id"))
    inventory_item_id = Column(Integer, ForeignKey("inventory_items.id"))
    quantity = Column(Float)
    unit_price = Column(Float)
    total_price = Column(Float)

    purchase = relationship("Purchase", back_populates="items")
    inventory_item = relationship("InventoryItem")


class PurchasePayment(Base):
    """Mirrors Invoice's Payment model - money paid out to a vendor for a purchase."""
    __tablename__ = "purchase_payments"

    id = Column(Integer, primary_key=True, index=True)
    purchase_id = Column(Integer, ForeignKey("purchases.id"))
    amount = Column(Float)
    method = Column(Enum(PaymentMethod))
    reference_number = Column(String, nullable=True)
    payment_date = Column(Date, default=lambda: datetime.utcnow().date())
    notes = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    cheque_number = Column(String, nullable=True)
    cheque_date = Column(Date, nullable=True)
    issued_branch = Column(String, nullable=True)
    cheque_status = Column(Enum(ChequeStatus), nullable=True)
    cheque_deposit_date = Column(Date, nullable=True)

    purchase = relationship("Purchase", back_populates="payments")
