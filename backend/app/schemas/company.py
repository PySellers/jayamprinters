from pydantic import BaseModel, Field
from typing import Optional


class HsnCreate(BaseModel):
    code: str = Field(min_length=2, max_length=12)
    description: Optional[str] = None
    gst_rate: float = Field(ge=0, le=100)
    is_active: bool = True


class HsnUpdate(BaseModel):
    code: Optional[str] = Field(default=None, min_length=2, max_length=12)
    description: Optional[str] = None
    gst_rate: Optional[float] = Field(default=None, ge=0, le=100)
    is_active: Optional[bool] = None


class HsnOut(HsnCreate):
    id: int

    class Config:
        from_attributes = True


class CompanyOut(BaseModel):
    name: str
    tagline: Optional[str] = None
    gstin: Optional[str] = None
    state_code: Optional[str] = None
    address: Optional[str] = None
    phones: Optional[str] = None
    landline: Optional[str] = None
    email: Optional[str] = None
    bank_name: Optional[str] = None
    bank_branch: Optional[str] = None
    bank_account_name: Optional[str] = None
    bank_account_no: Optional[str] = None
    bank_ifsc: Optional[str] = None
    show_bank_on_invoice: bool = True
    next_gst_invoice_no: int = 1
    next_cash_bill_no: int = 1
    next_challan_no: int = 1

    class Config:
        from_attributes = True


class CompanyUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1)
    tagline: Optional[str] = None
    gstin: Optional[str] = None
    state_code: Optional[str] = None
    address: Optional[str] = None
    phones: Optional[str] = None
    landline: Optional[str] = None
    email: Optional[str] = None
    bank_name: Optional[str] = None
    bank_branch: Optional[str] = None
    bank_account_name: Optional[str] = None
    bank_account_no: Optional[str] = None
    bank_ifsc: Optional[str] = None
    show_bank_on_invoice: Optional[bool] = None
    next_gst_invoice_no: Optional[int] = Field(default=None, ge=1)
    next_cash_bill_no: Optional[int] = Field(default=None, ge=1)
    next_challan_no: Optional[int] = Field(default=None, ge=1)
