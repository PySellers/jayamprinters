from pydantic import BaseModel
from typing import List, Optional
from datetime import date, datetime
from app.models.invoice import InvoiceStatus, PaymentMethod
from app.schemas.quotation import SelectedOptionOut


class InvoiceItemOut(BaseModel):
    id: int
    product_id: int
    quantity: int
    area_sqft: Optional[float]
    unit_price: float
    total_price: float
    spec_notes: Optional[str] = None
    selected_options: List[SelectedOptionOut] = []

    class Config:
        from_attributes = True


class InvoiceStatusUpdate(BaseModel):
    status: InvoiceStatus


class PaymentCreate(BaseModel):
    amount: float
    method: PaymentMethod
    reference_number: Optional[str] = None
    notes: Optional[str] = None


class PaymentOut(PaymentCreate):
    id: int
    payment_date: date
    created_at: datetime

    class Config:
        from_attributes = True


class InvoiceOut(BaseModel):
    id: int
    invoice_number: str
    quotation_id: int
    customer_id: int
    tax_id: Optional[int]
    subtotal: float
    tax_amount: float
    grand_total: float
    amount_paid: float
    status: InvoiceStatus
    with_gst: bool = False
    invoice_date: date
    notes: Optional[str]
    created_at: datetime
    items: List[InvoiceItemOut]
    payments: List[PaymentOut]

    class Config:
        from_attributes = True