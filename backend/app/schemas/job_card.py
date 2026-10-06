from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime
from app.models.job_card import JobCardStatus, JobCardPriority


class JobCardCreate(BaseModel):
    customer_id: int
    product_id: int
    quotation_item_id: Optional[int] = None
    machine_id: Optional[int] = None
    designer_id: Optional[int] = None
    operator_id: Optional[int] = None
    delivery_date: Optional[date] = None
    priority: JobCardPriority = JobCardPriority.medium
    notes: Optional[str] = None


class JobCardUpdate(BaseModel):
    machine_id: Optional[int] = None
    designer_id: Optional[int] = None
    operator_id: Optional[int] = None
    delivery_date: Optional[date] = None
    priority: Optional[JobCardPriority] = None
    notes: Optional[str] = None


class JobCardOut(JobCardCreate):
    id: int
    job_number: str
    status: JobCardStatus
    created_at: datetime

    class Config:
        from_attributes = True


class JobCardStatusUpdate(BaseModel):
    status: JobCardStatus


class JobCardCommentCreate(BaseModel):
    text: str
    created_by: Optional[int] = None


class JobCardCommentOut(BaseModel):
    id: int
    job_card_id: int
    text: str
    created_by: Optional[int]
    created_at: datetime

    class Config:
        from_attributes = True
