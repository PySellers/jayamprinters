from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Date, Enum, Boolean, JSON, text
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

class Quotation(Base):
    __tablename__ = "quotations"

    id = Column(Integer, primary_key=True, index=True)
    quotation_number = Column(String, unique=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"))
    status = Column(Enum(QuotationStatus), default=QuotationStatus.draft)
    tax_id = Column(Integer, ForeignKey("taxes.id"), nullable=True)
    total_amount = Column(Float, default=0.0)
    tax_amount = Column(Float, default=0.0)
    grand_total = Column(Float, default=0.0)
    notes = Column(String, nullable=True)
    with_gst = Column(Boolean, nullable=False, default=True, server_default=text("true"))
    # True = created by Start New Order (goes straight to an invoice). Hidden from the Quotations page.
    is_order = Column(Boolean, nullable=False, default=False, server_default=text("false"))
    proof1_date = Column(Date, nullable=True)
    proof1_time = Column(String, nullable=True)
    proof2_date = Column(Date, nullable=True)
    proof2_time = Column(String, nullable=True)
    delivery_date = Column(Date, nullable=True)
    delivery_time = Column(String, nullable=True)
    # Free text for a quotation, e.g. "5 working days" or "by 12 Nov" (a quotation has no proof or delivery dates).
    estimated_delivery = Column(String, nullable=True)
    # Discount on the whole order: type is "percent" or "amount"; discount_amount is the rupee value taken off the total.
    discount_type = Column(String, nullable=True)
    discount_value = Column(Float, nullable=False, default=0.0, server_default="0")
    discount_amount = Column(Float, nullable=False, default=0.0, server_default="0")
    # low / medium / high / urgent: handed to the job cards made from this order.
    priority = Column(String, nullable=True)
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
    # How many copies (sets) of the document -- per-set charges such as binding multiply by this.
    sets = Column(Integer, nullable=False, default=1)
    # Paper GSM of the 2nd, 3rd... copy of a bill book set (option ids; blank = same as the top copy).
    layer_gsm_option_ids = Column(JSON, nullable=True)
    # Printing charge included in unit_price / total_price (kept for the breakdown shown to staff).
    print_charge = Column(Float, nullable=False, default=0.0, server_default="0")
    hsn_code = Column(String, nullable=True)
    tax_rate = Column(Float, nullable=False, default=0.0, server_default="0")
    tax_amount = Column(Float, nullable=False, default=0.0, server_default="0")
    # Every copy of a set: [{"paper_option_id", "gsm_option_id", "size_product_id", "colour"}] (copy 1 first).
    layer_specs = Column(JSON, nullable=True)
    # Charges typed in by hand: [{"label", "amount", "group"}].
    custom_charges = Column(JSON, nullable=True)
    # How the price was made up, frozen when the order was saved: [{"kind", "label", "detail", "amount", ...}].
    price_breakdown = Column(JSON, nullable=True)
    # This line's share of the order discount (the discount is spread over the lines by value).
    discount_amount = Column(Float, nullable=False, default=0.0, server_default="0")

    quotation = relationship("Quotation", back_populates="items")
    product = relationship("Product")
    selected_options = relationship("QuotationItemAttributeOption", cascade="all, delete-orphan")
    extra_charges = relationship("QuotationItemExtraCharge", cascade="all, delete-orphan")

    @property
    def charge_lines(self):
        """The extra charges on this line, named, for the order screens and the job card."""
        return [
            {
                "extra_charge_id": c.extra_charge_id,
                "name": c.extra_charge.name if c.extra_charge else "",
                "group_name": c.extra_charge.group_name if c.extra_charge else None,
                "amount": c.computed_amount or 0.0,
            }
            for c in self.extra_charges
        ]


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