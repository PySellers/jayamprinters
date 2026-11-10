from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, Field

from app.models.outsource import OutsourceStatus


class OutsourceCreate(BaseModel):
    vendor_id: Optional[int] = None
    vendor_name: Optional[str] = None
    customer_id: Optional[int] = None
    job_card_id: Optional[int] = None
    service: str = Field(min_length=1)
    description: Optional[str] = None
    size: Optional[str] = None
    quantity: int = Field(default=1, ge=1)
    sent_date: Optional[date] = None
    expected_date: Optional[date] = None
    received_date: Optional[date] = None
    status: OutsourceStatus = OutsourceStatus.sent
    cost_amount: float = Field(default=0.0, ge=0)
    customer_price: float = Field(default=0.0, ge=0)
    notes: Optional[str] = None


class OutsourceUpdate(BaseModel):
    vendor_id: Optional[int] = None
    vendor_name: Optional[str] = None
    customer_id: Optional[int] = None
    job_card_id: Optional[int] = None
    service: Optional[str] = Field(default=None, min_length=1)
    description: Optional[str] = None
    size: Optional[str] = None
    quantity: Optional[int] = Field(default=None, ge=1)
    sent_date: Optional[date] = None
    expected_date: Optional[date] = None
    received_date: Optional[date] = None
    status: Optional[OutsourceStatus] = None
    cost_amount: Optional[float] = Field(default=None, ge=0)
    customer_price: Optional[float] = Field(default=None, ge=0)
    notes: Optional[str] = None


class OutsourcePayment(BaseModel):
    amount: float = Field(gt=0)
    method: Optional[str] = None
    reference_number: Optional[str] = None
    upi_id: Optional[str] = None
    bank_details: Optional[str] = None
    notes: Optional[str] = None


class OutsourcePaymentOut(OutsourcePayment):
    id: int
    payment_date: Optional[date] = None
    has_proof: bool = False

    class Config:
        from_attributes = True


class OutsourceOut(BaseModel):
    id: int
    job_number: str
    vendor_id: Optional[int] = None
    vendor_name: Optional[str] = None
    customer_id: Optional[int] = None
    job_card_id: Optional[int] = None
    service: str
    description: Optional[str] = None
    size: Optional[str] = None
    quantity: int
    sent_date: Optional[date] = None
    expected_date: Optional[date] = None
    received_date: Optional[date] = None
    status: OutsourceStatus
    cost_amount: float
    customer_price: float
    amount_paid: float
    notes: Optional[str] = None
    created_at: Optional[datetime] = None
    # worked out for the screen
    margin: float = 0.0
    balance_to_pay: float = 0.0
    payments: List[OutsourcePaymentOut] = []

    class Config:
        from_attributes = True
