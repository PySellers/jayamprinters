from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String, Boolean, text

from app.core.database import Base


class Customer(Base):
    __tablename__ = "customers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    billing_person_name = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    whatsapp_number = Column(String, nullable=True)
    email = Column(String, nullable=True)
    address = Column(String, nullable=True)
    gstin = Column(String, nullable=True)
    reason = Column(String, nullable=True)
    notes = Column(String, nullable=True)
    # Removed from the Billing Person Name list on the order form (the customer, their orders and bills are kept).
    hidden_in_billing = Column(Boolean, nullable=False, default=False, server_default=text("false"))
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)