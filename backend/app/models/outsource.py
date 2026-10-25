from datetime import date, datetime
import enum

from sqlalchemy import Column, Date, DateTime, Enum, Float, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.core.database import Base


class OutsourceStatus(str, enum.Enum):
    sent = "sent"              # handed to the outside press
    in_progress = "in_progress"
    received = "received"      # back in the shop
    delivered = "delivered"    # handed over to our customer
    cancelled = "cancelled"


class OutsourceJob(Base):
    """A job the shop does not print itself: it is sent to an outside company and handed back to the customer.

    cost_amount is what the outside company charges us; customer_price is what we bill our customer, so the
    difference is the margin on the job."""

    __tablename__ = "outsource_jobs"

    id = Column(Integer, primary_key=True, index=True)
    job_number = Column(String, unique=True, index=True)
    vendor_id = Column(Integer, ForeignKey("vendors.id"), nullable=True)
    vendor_name = Column(String, nullable=True)  # when the outside company is not in the vendor list
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=True)
    job_card_id = Column(Integer, ForeignKey("job_cards.id"), nullable=True)
    service = Column(String, nullable=False)  # what is being outsourced, e.g. "Large vinyl stickers"
    description = Column(String, nullable=True)
    size = Column(String, nullable=True)
    quantity = Column(Integer, nullable=False, default=1)
    sent_date = Column(Date, default=lambda: datetime.utcnow().date())
    expected_date = Column(Date, nullable=True)
    received_date = Column(Date, nullable=True)
    status = Column(Enum(OutsourceStatus), nullable=False, default=OutsourceStatus.sent)
    cost_amount = Column(Float, nullable=False, default=0.0)       # paid to the outside company
    customer_price = Column(Float, nullable=False, default=0.0)    # billed to our customer
    amount_paid = Column(Float, nullable=False, default=0.0)       # already paid to the outside company
    notes = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    vendor = relationship("Vendor")
    customer = relationship("Customer")
