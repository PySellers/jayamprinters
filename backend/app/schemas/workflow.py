from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, Field


# ---- work centers ------------------------------------------------------------------------------------
class WorkCenterIn(BaseModel):
    name: str = Field(min_length=1)
    description: Optional[str] = None
    color: Optional[str] = None
    display_order: int = 0
    is_active: bool = True


class WorkCenterUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1)
    description: Optional[str] = None
    color: Optional[str] = None
    display_order: Optional[int] = None
    is_active: Optional[bool] = None


class MemberRef(BaseModel):
    id: int
    name: str


class WorkCenterOut(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    color: Optional[str] = None
    display_order: int
    is_active: bool
    members: List[MemberRef] = []
    open_steps: int = 0


class MembersIn(BaseModel):
    user_ids: List[int]


class StaffOut(BaseModel):
    id: int
    name: str
    role: str
    work_center_ids: List[int] = []


# ---- workflow templates --------------------------------------------------------------------------------
class TemplateStepIO(BaseModel):
    name: str = Field(min_length=1)
    kind: str = "internal"
    stage: str = "printing"
    work_center_id: Optional[int] = None


class TemplateStepOut(TemplateStepIO):
    id: int
    position: int
    work_center_name: Optional[str] = None


class TemplateOut(BaseModel):
    category_id: Optional[int] = None
    category_name: str
    is_custom: bool
    steps: List[TemplateStepOut]


class TemplateIn(BaseModel):
    steps: List[TemplateStepIO] = Field(min_length=1)


# ---- job steps ---------------------------------------------------------------------------------------------
class StepOut(BaseModel):
    id: int
    job_card_id: int
    position: int
    name: str
    kind: str
    stage: str
    status: str
    work_center_id: Optional[int] = None
    work_center_name: Optional[str] = None
    work_center_color: Optional[str] = None
    assigned_to: Optional[int] = None
    assigned_to_name: Optional[str] = None
    ready_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    started_by_name: Optional[str] = None
    completed_by_name: Optional[str] = None
    minutes_taken: Optional[int] = None
    minutes_waiting: Optional[int] = None
    due_date: Optional[date] = None
    hold_reason: Optional[str] = None
    notes: Optional[str] = None
    outsource_job_id: Optional[int] = None
    outsource_job_number: Optional[str] = None
    outsource_vendor: Optional[str] = None
    outsource_expected_date: Optional[date] = None
    can_act: bool = False


class StepUpdate(BaseModel):
    name: Optional[str] = None
    kind: Optional[str] = None
    work_center_id: Optional[int] = None
    due_date: Optional[date] = None
    notes: Optional[str] = None


class StepAdd(BaseModel):
    name: str = Field(min_length=1)
    work_center_id: Optional[int] = None
    kind: str = "internal"
    stage: str = "printing"
    after_step_id: Optional[int] = None


class AssignIn(BaseModel):
    user_id: Optional[int] = None


class NoteIn(BaseModel):
    note: Optional[str] = None


class HoldIn(BaseModel):
    reason: str = Field(min_length=1)


class MoveIn(BaseModel):
    direction: str = Field(pattern="^(up|down)$")


class SendOutIn(BaseModel):
    vendor_id: Optional[int] = None
    vendor_name: Optional[str] = None
    cost_amount: float = Field(default=0.0, ge=0)
    customer_price: float = Field(default=0.0, ge=0)
    expected_date: Optional[date] = None
    description: Optional[str] = None


class EventOut(BaseModel):
    id: int
    step_id: Optional[int] = None
    step_name: Optional[str] = None
    user_name: Optional[str] = None
    action: str
    detail: Optional[str] = None
    created_at: Optional[datetime] = None
