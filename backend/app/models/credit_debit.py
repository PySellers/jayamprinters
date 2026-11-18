from datetime import date, datetime

from sqlalchemy import Column, Date, DateTime, Float, Integer, String

from app.core.database import Base


class CreditDebitEntry(Base):
    """One line of the Credit / Debit book: who, how much and why. Credit and debit entries are kept apart (kind)."""

    __tablename__ = "credit_debit_entries"

    id = Column(Integer, primary_key=True, index=True)
    kind = Column(String, nullable=False, index=True)  # 'credit' | 'debit'
    name = Column(String, nullable=False, index=True)
    amount = Column(Float, nullable=False)
    note = Column(String, nullable=True)
    entry_date = Column(Date, nullable=False, default=date.today, index=True)
    created_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
