from sqlalchemy import Column, Integer, String, Date, DateTime, ForeignKey, Enum
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
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Per-production-stage sign-off, matching the shop's paper job-card layout (S.No / Order
    # Taken By / DTP / Machine Man / Rubber Stamp / Numbering / Binding / Proof Verified). DTP and
    # Machine Man are already covered by designer_id/operator_id above; these cover the stages
    # that weren't modeled yet. All optional since not every job passes through every stage.
    order_taken_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    rubber_stamp_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    numbering_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    binding_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    proof_verified_customer = Column(DateTime, nullable=True)
    proof_verified_press_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    proof_verified_press_at = Column(DateTime, nullable=True)

    quotation_item = relationship("QuotationItem")
    customer = relationship("Customer")
    product = relationship("Product")
    machine = relationship("Machine")
    designer = relationship("User", foreign_keys=[designer_id])
    operator = relationship("User", foreign_keys=[operator_id])
    order_taken_by = relationship("User", foreign_keys=[order_taken_by_id])
    rubber_stamp_by = relationship("User", foreign_keys=[rubber_stamp_by_id])
    numbering_by = relationship("User", foreign_keys=[numbering_by_id])
    binding_by = relationship("User", foreign_keys=[binding_by_id])
    proof_verified_press_by = relationship("User", foreign_keys=[proof_verified_press_id])
