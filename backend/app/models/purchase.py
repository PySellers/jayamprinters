import enum
from datetime import datetime

from sqlalchemy import Boolean, Column, Integer, String, Float, Date, DateTime, ForeignKey, Enum
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.invoice import PaymentMethod


class Vendor(Base):
    __tablename__ = "vendors"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    phone = Column(String, nullable=True)
    email = Column(String, nullable=True)
    address = Column(String, nullable=True)
    gstin = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)


class InventoryItem(Base):
    """A raw material / stock item (paper reams, ink cartridges, binding
    spirals, rubber stamp blanks, etc). Quantity moves in two places:
    up when a PurchaseItem for it is recorded, and can be adjusted by hand
    here for consumption/wastage/manual correction."""
    __tablename__ = "inventory_items"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, unique=True)
    unit = Column(String, nullable=False, default="pcs")  # e.g. "sheets", "reams", "pcs", "litres"
    current_qty = Column(Float, nullable=False, default=0.0)
    reorder_threshold = Column(Float, nullable=False, default=0.0)
    notes = Column(String, nullable=True)


class PurchaseStatus(str, enum.Enum):
    unpaid = "unpaid"
    partially_paid = "partially_paid"
    paid = "paid"


class Purchase(Base):
    """A vendor bill for stock brought in. Mirrors Invoice's shape
    (subtotal/paid_amount/status, payments relationship) so the same mental
    model applies on both the sales side and the purchase side."""
    __tablename__ = "purchases"

    id = Column(Integer, primary_key=True, index=True)
    purchase_number = Column(String, unique=True, index=True)
    vendor_id = Column(Integer, ForeignKey("vendors.id"))
    purchase_date = Column(Date, default=lambda: datetime.utcnow().date())
    total_amount = Column(Float, default=0.0)
    paid_amount = Column(Float, default=0.0)
    status = Column(Enum(PurchaseStatus), default=PurchaseStatus.unpaid)
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
    quantity = Column(Float, nullable=False)
    unit_price = Column(Float, nullable=False)
    total_price = Column(Float, nullable=False)

    purchase = relationship("Purchase", back_populates="items")
    inventory_item = relationship("InventoryItem")


class PurchasePayment(Base):
    __tablename__ = "purchase_payments"

    id = Column(Integer, primary_key=True, index=True)
    purchase_id = Column(Integer, ForeignKey("purchases.id"))
    amount = Column(Float, nullable=False)
    method = Column(Enum(PaymentMethod), nullable=True)
    reference_number = Column(String, nullable=True)
    payment_date = Column(Date, default=lambda: datetime.utcnow().date())
    notes = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    purchase = relationship("Purchase", back_populates="payments")
