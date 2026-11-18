from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String

from app.core.database import Base


class InvoiceEdit(Base):
    """What was changed on an invoice after it was made, and by whom."""

    __tablename__ = "invoice_edits"

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False, index=True)
    edited_by = Column(String, nullable=True)
    edited_at = Column(DateTime, default=datetime.utcnow)
    summary = Column(String, nullable=True)
