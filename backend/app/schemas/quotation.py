from pydantic import BaseModel, Field
from typing import Any, Dict, List, Literal, Optional
from datetime import datetime, date
from app.models.quotation import QuotationStatus

class SelectedOptionIn(BaseModel):
    attribute_id: int
    attribute_option_id: int

class SelectedOptionOut(SelectedOptionIn):
    class Config:
        from_attributes = True

class LayerSpecIn(BaseModel):
    """Paper of one copy of a set (copy 1 = the top / original copy)."""
    paper_option_id: Optional[int] = None     # paper name (Royal Ex.Bond ...)
    gsm_option_id: Optional[int] = None       # GSM / grade
    size_product_id: Optional[int] = None     # paper size (the size item of the service)
    colour: Optional[str] = None              # paper colour (White, Pink ...)
    paper_custom: Optional[str] = None        # the paper's name when 'Custom' was chosen

class CustomChargeIn(BaseModel):
    """A charge typed in by hand at the counter (the 'Custom' choice of an extra-charge dropdown)."""
    label: str = Field(min_length=1, max_length=120)
    amount: float = Field(ge=0)
    group: Optional[str] = None

class ChargeLineOut(BaseModel):
    extra_charge_id: Optional[int] = None
    name: str = ""
    group_name: Optional[str] = None
    amount: float = 0.0

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
    # Paper name / GSM / size / colour of EVERY copy of the set (copy 1 first).
    layer_specs: List[LayerSpecIn] = []
    custom_charges: List[CustomChargeIn] = []
    # Invitation-type items: the card price and the printing charge typed by the counter (see Product.allow_manual_amounts).
    card_amount: Optional[float] = Field(default=None, ge=0)
    card_amount_mode: Optional[Literal["per_card", "total"]] = None
    printing_charge_manual: Optional[float] = Field(default=None, ge=0)
    # Text typed for a drop-down's 'Custom' choice: {attribute_id: text}
    option_texts: Dict[str, str] = {}

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
    layer_specs: Optional[List[Dict[str, Any]]] = None
    custom_charges: Optional[List[Dict[str, Any]]] = None
    price_breakdown: Optional[List[Dict[str, Any]]] = None
    charge_lines: List[ChargeLineOut] = []
    print_charge: float = 0.0
    discount_amount: float = 0.0
    hsn_code: Optional[str] = None
    tax_rate: float = 0.0
    tax_amount: float = 0.0
    card_amount: Optional[float] = None
    card_amount_mode: Optional[str] = None
    printing_charge_manual: Optional[float] = None
    option_texts: Optional[Dict[str, str]] = None
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
    # Discount on the whole order, taken off before GST: a percentage or a rupee amount.
    discount_type: Optional[Literal["percent", "amount"]] = None
    discount_value: float = Field(default=0.0, ge=0)
    # low / medium / high / urgent, handed to the job cards of this order.
    priority: Optional[Literal["low", "medium", "high", "urgent"]] = None
    # The final amount the counter typed (blank = the calculated total). The difference is kept as 'Round off / adjustment'.
    final_amount: Optional[float] = Field(default=None, ge=0)
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
    discount_type: Optional[str] = None
    discount_value: float = 0.0
    discount_amount: float = 0.0
    adjustment_amount: float = 0.0
    priority: Optional[str] = None
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
    layer_specs: List[LayerSpecIn] = []
    custom_charges: List[CustomChargeIn] = []
    # Invitation-type items: the card price and the printing charge typed by the counter (see Product.allow_manual_amounts).
    card_amount: Optional[float] = Field(default=None, ge=0)
    card_amount_mode: Optional[Literal["per_card", "total"]] = None
    printing_charge_manual: Optional[float] = Field(default=None, ge=0)
    # Text typed for a drop-down's 'Custom' choice: {attribute_id: text}
    option_texts: Dict[str, str] = {}

class QuotationPreviewRequest(BaseModel):
    tax_id: Optional[int] = None
    with_gst: bool = True
    discount_type: Optional[Literal["percent", "amount"]] = None
    discount_value: float = Field(default=0.0, ge=0)
    final_amount: Optional[float] = Field(default=None, ge=0)
    items: List[QuotationPreviewItemIn]

class QuotationPreviewItemOut(BaseModel):
    unit_price: float
    total_price: float
    # False when the line can't be priced yet (e.g. a required attribute
    # hasn't been picked) -- the counter screen shows this line as "--"
    # instead of a misleading zero.
    priceable: bool
    # Why the line is not priceable yet, when the server can say (minimum quantity, missing rate ...).
    message: Optional[str] = None
    # Breakdown shown on the order screen before the invoice is generated.
    paper_total: float = 0.0
    print_charge: float = 0.0
    discount_amount: float = 0.0
    hsn_code: Optional[str] = None
    tax_rate: float = 0.0
    tax_amount: float = 0.0
    # Every part of the price, with where it comes from (and which Pricing Setup tab holds it).
    breakdown: List[Dict[str, Any]] = []

class TaxBreakdownRow(BaseModel):
    hsn_code: Optional[str] = None
    rate: float
    taxable: float
    tax: float

class QuotationPreviewOut(BaseModel):
    items: List[QuotationPreviewItemOut]
    subtotal: float
    discount_amount: float = 0.0
    taxable_amount: float = 0.0
    tax_amount: float
    # The total worked out from the prices, before a typed final amount; grand_total includes the adjustment.
    computed_total: float = 0.0
    adjustment_amount: float = 0.0
    grand_total: float
    tax_breakdown: List[TaxBreakdownRow] = []
