from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, LargeBinary, String

from app.core.database import Base


class PaymentProof(Base):
    """The UPI screenshot / bank-transfer slip / receipt kept with one payment.
    kind says which payment table payment_id belongs to: 'sale' (payments), 'purchase' (purchase_payments)
    or 'outsource' (outsource_payments)."""

    __tablename__ = "payment_proofs"

    id = Column(Integer, primary_key=True, index=True)
    kind = Column(String, nullable=False, index=True)
    payment_id = Column(Integer, nullable=False, index=True)
    filename = Column(String, nullable=True)
    content_type = Column(String, nullable=False)
    data = Column(LargeBinary, nullable=False)
    uploaded_at = Column(DateTime, default=datetime.utcnow)


def has_proof_for(session, kind: str, payment_id: int) -> bool:
    """True when a receipt is kept for the payment. The ids of one kind are read once per request (one query), so a list of
    invoices with many payments does not run a query for each of them."""
    cache = session.info.setdefault("payment_proof_ids", {})
    if kind not in cache:
        cache[kind] = {row[0] for row in session.query(PaymentProof.payment_id).filter(PaymentProof.kind == kind).all()}
    return payment_id in cache[kind]
