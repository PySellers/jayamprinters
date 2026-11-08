from datetime import datetime

from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship
from app.core.database import Base

PROOF_STATUSES = ("scheduled", "sent", "approved", "changes")


class JobProof(Base):
    """A design proof shown to the customer for one job card (Proof 1, Proof 2 ... as many as it takes)."""
    __tablename__ = "job_proofs"

    id = Column(Integer, primary_key=True, index=True)
    job_card_id = Column(Integer, ForeignKey("job_cards.id", ondelete="CASCADE"), index=True, nullable=False)
    number = Column(Integer, nullable=False)
    due_date = Column(Date, nullable=True)
    due_time = Column(String, nullable=True)
    status = Column(String, nullable=False, default="scheduled")  # scheduled | sent | approved | changes
    handled_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    notes = Column(String, nullable=True)
    sent_at = Column(DateTime, nullable=True)
    decided_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    handler = relationship("User", foreign_keys=[handled_by])
