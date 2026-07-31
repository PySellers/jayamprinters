from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Date, Enum
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from app.core.database import Base

class QuotationStatus(str, enum.Enum):
    draft = "draft"
    sent = "sent"
    approved = "approved"
    rejected = "rejected"
    converted = "converted"

class OrderType(str, enum.Enum):
    offline = "offline"
    online = "online"

class Quotation(Base):
    __tablename__ = "quotations"

    id = Column(Integer, primary_key=True, index=True)
    quotation_number = Column(String, unique=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"))
    status = Column(Enum(QuotationStatus), default=QuotationStatus.draft)
    order_type = Column(Enum(OrderType), default=OrderType.offline, nullable=False, server_default=OrderType.offline.value)
    tax_id = Column(Integer, ForeignKey("taxes.id"), nullable=True)
    total_amount = Column(Float, default=0.0)
    tax_amount = Column(Float, default=0.0)
    grand_total = Column(Float, default=0.0)
    notes = Column(String, nullable=True)
    delivery_date = Column(Date, nullable=True)
    delivery_time = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    customer = relationship("Customer")
    tax = relationship("Tax")
    items = relationship("QuotationItem", back_populates="quotation", cascade="all, delete-orphan")


class QuotationItem(Base):
    __tablename__ = "quotation_items"

    id = Column(Integer, primary_key=True, index=True)
    quotation_id = Column(Integer, ForeignKey("quotations.id"))
    product_id = Column(Integer, ForeignKey("products.id"))
    quantity = Column(Integer)
    area_sqft = Column(Float, nullable=True)
    unit_price = Column(Float)
    total_price = Column(Float)
    spec_notes = Column(String, nullable=True)

    quotation = relationship("Quotation", back_populates="items")
    product = relationship("Product")
    selected_options = relationship("QuotationItemAttributeOption", cascade="all, delete-orphan")
    extra_charges = relationship("QuotationItemExtraCharge", cascade="all, delete-orphan")


class QuotationItemAttributeOption(Base):
    __tablename__ = "quotation_item_attribute_options"

    id = Column(Integer, primary_key=True, index=True)
    quotation_item_id = Column(Integer, ForeignKey("quotation_items.id"))
    attribute_id = Column(Integer, ForeignKey("attributes.id"))
    attribute_option_id = Column(Integer, ForeignKey("attribute_options.id"))

    attribute = relationship("Attribute")
    attribute_option = relationship("AttributeOption")


class QuotationItemExtraCharge(Base):
    __tablename__ = "quotation_item_extra_charges"

    id = Column(Integer, primary_key=True, index=True)
    quotation_item_id = Column(Integer, ForeignKey("quotation_items.id"))
    extra_charge_id = Column(Integer, ForeignKey("extra_charges.id"))
    computed_amount = Column(Float)

    extra_charge = relationship("ExtraCharge")