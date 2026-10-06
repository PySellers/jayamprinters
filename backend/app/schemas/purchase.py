from pydantic import BaseModel
from typing import List, Optional
from datetime import date, datetime

from app.models.purchase import PurchaseStatus
from app.models.invoice import PaymentMethod


class VendorCreate(BaseModel):
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    gstin: Optional[str] = None


class VendorUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    gstin: Optional[str] = None
    is_active: Optional[bool] = None


class VendorOut(VendorCreate):
    id: int
    is_active: bool

    class Config:
        from_attributes = True


class InventoryItemCreate(BaseModel):
    name: str
    unit: str = "pcs"
    current_qty: float = 0.0
    reorder_threshold: float = 0.0
    notes: Optional[str] = None


class InventoryItemUpdate(BaseModel):
    name: Optional[str] = None
    unit: Optional[str] = None
    current_qty: Optional[float] = None
    reorder_threshold: Optional[float] = None
    notes: Optional[str] = None


class InventoryItemOut(InventoryItemCreate):
    id: int
    low_stock: bool

    class Config:
        from_attributes = True


class PurchaseItemIn(BaseModel):
    inventory_item_id: int
    quantity: float
    unit_price: float


class PurchaseItemOut(PurchaseItemIn):
    id: int
    total_price: float

    class Config:
        from_attributes = True


class PurchaseCreate(BaseModel):
    vendor_id: int
    purchase_date: Optional[date] = None
    notes: Optional[str] = None
    items: List[PurchaseItemIn]


class PurchasePaymentCreate(BaseModel):
    amount: float
    method: Optional[PaymentMethod] = None
    reference_number: Optional[str] = None
    notes: Optional[str] = None


class PurchasePaymentOut(PurchasePaymentCreate):
    id: int
    payment_date: date
    created_at: datetime

    class Config:
        from_attributes = True


class PurchaseOut(BaseModel):
    id: int
    purchase_number: str
    vendor_id: int
    purchase_date: date
    total_amount: float
    paid_amount: float
    status: PurchaseStatus
    notes: Optional[str]
    created_at: datetime
    items: List[PurchaseItemOut]
    payments: List[PurchasePaymentOut]

    class Config:
        from_attributes = True
