from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base


class JobCardComment(Base):
    __tablename__ = "job_card_comments"

    id = Column(Integer, primary_key=True, index=True)
    job_card_id = Column(Integer, ForeignKey("job_cards.id"))
    text = Column(String, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    job_card = relationship("JobCard")
    author = relationship("User")
