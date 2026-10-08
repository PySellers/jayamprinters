from sqlalchemy import Column, Integer, String, Date, DateTime, ForeignKey, JSON, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base


class DeliveryChallan(Base):
    """One delivery challan (DC) per job card.

    `dc_number` is the printed S.No. It runs 1, 2, 3 ... inside a financial year
    (April to March) and starts again from 1 every April -- so the pair
    (financial_year, dc_number) is what is unique, not dc_number alone.
    `financial_year` is the calendar year in which that April falls
    (e.g. 2026 = April 2026 to March 2027).
    """
    __tablename__ = "delivery_challans"
    __table_args__ = (UniqueConstraint("financial_year", "dc_number", name="uq_dc_fy_number"),)

    id = Column(Integer, primary_key=True, index=True)
    financial_year = Column(Integer, nullable=False)
    dc_number = Column(Integer, nullable=False)
    # SET NULL: deleting a job card must never delete a numbered challan.
    job_card_id = Column(Integer, ForeignKey("job_cards.id", ondelete="SET NULL"), unique=True, nullable=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False)
    challan_date = Column(Date, nullable=False)
    to_text = Column(String, nullable=True)
    items = Column(JSON, nullable=True)  # [{"particulars": "...", "qty": "..."}]
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    customer = relationship("Customer")