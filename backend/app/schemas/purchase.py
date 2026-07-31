from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, Field

from app.models.invoice import ChequeStatus, PaymentMethod
from app.models.purchase import PurchasePaymentStatus


class PurchaseItemCreate(BaseModel):
    inventory_item_id: int
    quantity: float = Field(gt=0)
    unit_price: float = Field(ge=0)


class PurchaseItemOut(BaseModel):
    id: int
    inventory_item_id: int
    quantity: float
    unit_price: float
    total_price: float

    class Config:
        from_attributes = True


class PurchaseCreate(BaseModel):
    vendor_id: int
    purchase_date: Optional[date] = None
    tax_amount: float = 0.0
    notes: Optional[str] = None
    items: List[PurchaseItemCreate]


class PurchasePaymentCreate(BaseModel):
    amount: float = Field(gt=0)
    method: PaymentMethod
    reference_number: Optional[str] = None
    notes: Optional[str] = None
    cheque_number: Optional[str] = None
    cheque_date: Optional[date] = None
    issued_branch: Optional[str] = None
    cheque_status: Optional[ChequeStatus] = None
    cheque_deposit_date: Optional[date] = None


class PurchasePaymentOut(PurchasePaymentCreate):
    id: int
    purchase_id: int
    payment_date: date
    created_at: datetime

    class Config:
        from_attributes = True


class PurchaseOut(BaseModel):
    id: int
    purchase_number: str
    vendor_id: int
    purchase_date: date
    subtotal: float
    tax_amount: float
    grand_total: float
    amount_paid: float
    status: PurchasePaymentStatus
    notes: Optional[str]
    created_at: datetime
    items: List[PurchaseItemOut]
    payments: List[PurchasePaymentOut] = []

    class Config:
        from_attributes = True
