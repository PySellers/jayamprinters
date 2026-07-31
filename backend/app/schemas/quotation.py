from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, date
from app.models.quotation import OrderType, QuotationStatus

class SelectedOptionIn(BaseModel):
    attribute_id: int
    attribute_option_id: int

class SelectedOptionOut(SelectedOptionIn):
    class Config:
        from_attributes = True

class QuotationItemCreate(BaseModel):
    product_id: int
    quantity: int = Field(gt=0)
    area_sqft: Optional[float] = None
    selected_options: List[SelectedOptionIn] = []
    extra_charge_ids: List[int] = []
    spec_notes: Optional[str] = None

class QuotationItemOut(BaseModel):
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

class QuotationCreate(BaseModel):
    customer_id: int
    order_type: OrderType = OrderType.offline
    tax_id: Optional[int] = None
    notes: Optional[str] = None
    delivery_date: Optional[date] = None
    delivery_time: Optional[str] = None
    items: List[QuotationItemCreate]

class QuotationOut(BaseModel):
    id: int
    quotation_number: str
    customer_id: int
    status: QuotationStatus
    order_type: OrderType
    tax_id: Optional[int]
    total_amount: float
    tax_amount: float
    grand_total: float
    notes: Optional[str]
    delivery_date: Optional[date] = None
    delivery_time: Optional[str] = None
    created_at: datetime
    items: List[QuotationItemOut]

    class Config:
        from_attributes = True

class QuotationStatusUpdate(BaseModel):
    status: QuotationStatus
