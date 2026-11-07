"""Production workflow: a job card is worked through by several people, one step after another.

WorkCenter           a department / station (Design, Printing, Finishing, Front Desk, Outside vendor ...)
user_work_centers    which employees belong to which work center
WorkflowTemplate     the list of steps a service normally goes through (None category = the default for every service)
JobStep              one step of one job card, with who is on it and when it started / finished
JobEvent             the activity log of a job card (who did what, when)
"""
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Table, Date
from sqlalchemy.orm import relationship

from app.core.database import Base

STEP_KINDS = ("internal", "outsource", "purchase")
STEP_STATUSES = ("waiting", "ready", "in_progress", "on_hold", "done", "skipped")
OPEN_STATUSES = ("ready", "in_progress", "on_hold")

user_work_centers = Table(
    "user_work_centers",
    Base.metadata,
    Column("user_id", Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("work_center_id", Integer, ForeignKey("work_centers.id", ondelete="CASCADE"), primary_key=True),
)


class WorkCenter(Base):
    __tablename__ = "work_centers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, unique=True)
    description = Column(String, nullable=True)
    color = Column(String, nullable=True)  # e.g. "#1a237e", shown on the board
    display_order = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)

    members = relationship("User", secondary=user_work_centers, backref="work_centers")


class WorkflowTemplate(Base):
    __tablename__ = "workflow_templates"

    id = Column(Integer, primary_key=True, index=True)
    category_id = Column(Integer, ForeignKey("product_categories.id", ondelete="CASCADE"), nullable=True, unique=True)

    steps = relationship(
        "WorkflowTemplateStep", cascade="all, delete-orphan", order_by="WorkflowTemplateStep.position",
        back_populates="template",
    )


class WorkflowTemplateStep(Base):
    __tablename__ = "workflow_template_steps"

    id = Column(Integer, primary_key=True, index=True)
    template_id = Column(Integer, ForeignKey("workflow_templates.id", ondelete="CASCADE"), nullable=False)
    position = Column(Integer, nullable=False)
    name = Column(String, nullable=False)
    kind = Column(String, nullable=False, default="internal")
    # The job card's overall status while this step is being worked (design / approval / printing / binding / packing)
    stage = Column(String, nullable=False, default="printing")
    work_center_id = Column(Integer, ForeignKey("work_centers.id"), nullable=True)

    template = relationship("WorkflowTemplate", back_populates="steps")
    work_center = relationship("WorkCenter")


class JobStep(Base):
    __tablename__ = "job_steps"

    id = Column(Integer, primary_key=True, index=True)
    job_card_id = Column(Integer, ForeignKey("job_cards.id", ondelete="CASCADE"), nullable=False, index=True)
    position = Column(Integer, nullable=False)
    name = Column(String, nullable=False)
    kind = Column(String, nullable=False, default="internal")
    stage = Column(String, nullable=False, default="printing")
    work_center_id = Column(Integer, ForeignKey("work_centers.id"), nullable=True)
    status = Column(String, nullable=False, default="waiting", index=True)
    assigned_to = Column(Integer, ForeignKey("users.id"), nullable=True)
    ready_at = Column(DateTime, nullable=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    started_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    completed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    due_date = Column(Date, nullable=True)
    hold_reason = Column(String, nullable=True)
    notes = Column(String, nullable=True)
    outsource_job_id = Column(Integer, ForeignKey("outsource_jobs.id", ondelete="SET NULL"), nullable=True)

    job_card = relationship("JobCard", back_populates="steps")
    work_center = relationship("WorkCenter")
    assignee = relationship("User", foreign_keys=[assigned_to])
    starter = relationship("User", foreign_keys=[started_by])
    completer = relationship("User", foreign_keys=[completed_by])
    outsource_job = relationship("OutsourceJob")


class JobEvent(Base):
    __tablename__ = "job_events"

    id = Column(Integer, primary_key=True, index=True)
    job_card_id = Column(Integer, ForeignKey("job_cards.id", ondelete="CASCADE"), nullable=False, index=True)
    step_id = Column(Integer, ForeignKey("job_steps.id", ondelete="SET NULL"), nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    action = Column(String, nullable=False)
    detail = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    user = relationship("User")
    step = relationship("JobStep")
