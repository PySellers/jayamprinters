from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, Field


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


class PurchaseOut(BaseModel):
    id: int
    purchase_number: str
    vendor_id: int
    purchase_date: date
    subtotal: float
    tax_amount: float
    grand_total: float
    notes: Optional[str]
    created_at: datetime
    items: List[PurchaseItemOut]

    class Config:
        from_attributes = True
