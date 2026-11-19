from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class CustomerCreate(BaseModel):
    name: str
    billing_person_name: Optional[str] = None
    phone: Optional[str] = None
    whatsapp_number: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    gstin: Optional[str] = None
    reason: Optional[str] = None
    notes: Optional[str] = None
    hidden_in_billing: bool = False


class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    billing_person_name: Optional[str] = None
    phone: Optional[str] = None
    whatsapp_number: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    gstin: Optional[str] = None
    reason: Optional[str] = None
    notes: Optional[str] = None
    hidden_in_billing: Optional[bool] = None


class CustomerResponse(BaseModel):
    id: int
    name: str
    billing_person_name: Optional[str]
    phone: Optional[str]
    whatsapp_number: Optional[str]
    email: Optional[str]
    address: Optional[str]
    gstin: Optional[str]
    reason: Optional[str]
    notes: Optional[str]
    hidden_in_billing: bool = False
    created_at: datetime

    class Config:
        from_attributes = True


class BillingDefaults(BaseModel):
    next_person_name: str
    recent_customers: list[CustomerResponse] = []
