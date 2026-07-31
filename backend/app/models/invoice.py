from sqlalchemy import Column, Integer, String, Float, Date, DateTime, ForeignKey, Enum
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from app.core.database import Base
from app.models.quotation import OrderType


class InvoiceStatus(str, enum.Enum):
    unpaid = "unpaid"
    partially_paid = "partially_paid"
    paid = "paid"


class PaymentMethod(str, enum.Enum):
    cash = "cash"
    upi = "upi"
    card = "card"
    credit = "credit"
    bank_transfer = "bank_transfer"
    cheque = "cheque"


class ChequeStatus(str, enum.Enum):
    pending = "pending"
    deposited = "deposited"
    cleared = "cleared"
    bounced = "bounced"


class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True, index=True)
    invoice_number = Column(String, unique=True, index=True)
    quotation_id = Column(Integer, ForeignKey("quotations.id"), unique=True)
    customer_id = Column(Integer, ForeignKey("customers.id"))
    order_type = Column(Enum(OrderType), default=OrderType.offline, nullable=False, server_default=OrderType.offline.value)
    tax_id = Column(Integer, ForeignKey("taxes.id"), nullable=True)
    subtotal = Column(Float, default=0.0)
    tax_amount = Column(Float, default=0.0)
    grand_total = Column(Float, default=0.0)
    amount_paid = Column(Float, default=0.0)
    status = Column(Enum(InvoiceStatus), default=InvoiceStatus.unpaid)
    invoice_date = Column(Date, default=lambda: datetime.utcnow().date())
    notes = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    customer = relationship("Customer")
    tax = relationship("Tax")
    items = relationship("InvoiceItem", back_populates="invoice", cascade="all, delete-orphan")
    payments = relationship("Payment", back_populates="invoice", cascade="all, delete-orphan")


class InvoiceItem(Base):
    __tablename__ = "invoice_items"

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id"))
    product_id = Column(Integer, ForeignKey("products.id"))
    quantity = Column(Integer)
    area_sqft = Column(Float, nullable=True)
    unit_price = Column(Float)
    total_price = Column(Float)
    spec_notes = Column(String, nullable=True)

    invoice = relationship("Invoice", back_populates="items")
    selected_options = relationship("InvoiceItemAttributeOption", cascade="all, delete-orphan")


class InvoiceItemAttributeOption(Base):
    __tablename__ = "invoice_item_attribute_options"

    id = Column(Integer, primary_key=True, index=True)
    invoice_item_id = Column(Integer, ForeignKey("invoice_items.id"))
    attribute_id = Column(Integer, ForeignKey("attributes.id"))
    attribute_option_id = Column(Integer, ForeignKey("attribute_options.id"))

    attribute = relationship("Attribute")
    attribute_option = relationship("AttributeOption")


class Payment(Base):
    __tablename__ = "payments"

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id"))
    amount = Column(Float)
    method = Column(Enum(PaymentMethod))
    reference_number = Column(String, nullable=True)
    payment_date = Column(Date, default=lambda: datetime.utcnow().date())
    notes = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    # Only populated when method == cheque.
    cheque_number = Column(String, nullable=True)
    cheque_date = Column(Date, nullable=True)
    issued_branch = Column(String, nullable=True)
    cheque_status = Column(Enum(ChequeStatus), nullable=True)
    cheque_deposit_date = Column(Date, nullable=True)

    invoice = relationship("Invoice", back_populates="payments")
