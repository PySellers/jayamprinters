from sqlalchemy import Column, Integer, String, Date, DateTime, ForeignKey, Enum, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from app.core.database import Base


class JobCardStatus(str, enum.Enum):
    pending = "pending"
    design = "design"
    approval = "approval"
    printing = "printing"
    binding = "binding"
    packing = "packing"
    delivered = "delivered"


class JobCardPriority(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"
    urgent = "urgent"


class JobCard(Base):
    __tablename__ = "job_cards"

    id = Column(Integer, primary_key=True, index=True)
    job_number = Column(String, unique=True, index=True)
    quotation_item_id = Column(Integer, ForeignKey("quotation_items.id"), unique=True, nullable=True)
    customer_id = Column(Integer, ForeignKey("customers.id"))
    product_id = Column(Integer, ForeignKey("products.id"))
    machine_id = Column(Integer, ForeignKey("machines.id"), nullable=True)
    designer_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    operator_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    delivery_date = Column(Date, nullable=True)
    priority = Column(Enum(JobCardPriority), default=JobCardPriority.medium)
    status = Column(Enum(JobCardStatus), default=JobCardStatus.pending)
    notes = Column(String, nullable=True)
    # Free-form content of the paper job card (paper details, colours, payment boxes, ticks...)
    sheet_data = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    quotation_item = relationship("QuotationItem")
    customer = relationship("Customer")
    product = relationship("Product")
    machine = relationship("Machine")
    designer = relationship("User", foreign_keys=[designer_id])
    operator = relationship("User", foreign_keys=[operator_id])