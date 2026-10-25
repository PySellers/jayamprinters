from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, date
from app.models.quotation import QuotationStatus

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
    sets: int = Field(default=1, ge=1)
    # GSM of the 2nd, 3rd... copy of a bill-book set (attribute option ids); blank = same as the top copy.
    layer_gsm_option_ids: List[int] = []

class QuotationItemOut(BaseModel):
    id: int
    product_id: int
    quantity: int
    area_sqft: Optional[float]
    unit_price: float
    total_price: float
    spec_notes: Optional[str] = None
    sets: int = 1
    layer_gsm_option_ids: Optional[List[int]] = None
    print_charge: float = 0.0
    hsn_code: Optional[str] = None
    tax_rate: float = 0.0
    tax_amount: float = 0.0
    selected_options: List[SelectedOptionOut] = []

    class Config:
        from_attributes = True

class QuotationCreate(BaseModel):
    customer_id: int
    tax_id: Optional[int] = None
    notes: Optional[str] = None
    with_gst: bool = True
    is_order: bool = False
    proof1_date: Optional[date] = None
    proof1_time: Optional[str] = None
    proof2_date: Optional[date] = None
    proof2_time: Optional[str] = None
    delivery_date: Optional[date] = None
    delivery_time: Optional[str] = None
    estimated_delivery: Optional[str] = None
    items: List[QuotationItemCreate] = Field(min_length=1)

class QuotationOut(BaseModel):
    id: int
    quotation_number: str
    customer_id: int
    status: QuotationStatus
    tax_id: Optional[int]
    total_amount: float
    tax_amount: float
    grand_total: float
    notes: Optional[str]
    with_gst: bool = True
    is_order: bool = False
    proof1_date: Optional[date] = None
    proof1_time: Optional[str] = None
    proof2_date: Optional[date] = None
    proof2_time: Optional[str] = None
    delivery_date: Optional[date] = None
    delivery_time: Optional[str] = None
    estimated_delivery: Optional[str] = None
    created_at: datetime
    items: List[QuotationItemOut]

    class Config:
        from_attributes = True

class QuotationStatusUpdate(BaseModel):
    status: QuotationStatus

class QuotationPreviewItemIn(BaseModel):
    product_id: int
    quantity: int = Field(gt=0)
    area_sqft: Optional[float] = None
    selected_options: List[SelectedOptionIn] = []
    extra_charge_ids: List[int] = []
    sets: int = Field(default=1, ge=1)
    layer_gsm_option_ids: List[int] = []

class QuotationPreviewRequest(BaseModel):
    tax_id: Optional[int] = None
    with_gst: bool = True
    items: List[QuotationPreviewItemIn]

class QuotationPreviewItemOut(BaseModel):
    unit_price: float
    total_price: float
    # False when the line can't be priced yet (e.g. a required attribute
    # hasn't been picked) -- the counter screen shows this line as "--"
    # instead of a misleading zero.
    priceable: bool
    # Breakdown shown on the order screen before the invoice is generated.
    paper_total: float = 0.0
    print_charge: float = 0.0
    hsn_code: Optional[str] = None
    tax_rate: float = 0.0
    tax_amount: float = 0.0

class TaxBreakdownRow(BaseModel):
    hsn_code: Optional[str] = None
    rate: float
    taxable: float
    tax: float

class QuotationPreviewOut(BaseModel):
    items: List[QuotationPreviewItemOut]
    subtotal: float
    tax_amount: float
    grand_total: float
    tax_breakdown: List[TaxBreakdownRow] = []