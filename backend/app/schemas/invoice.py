from pydantic import BaseModel, Field, field_validator
from typing import Any, Dict, List, Optional
from datetime import date, datetime
from app.models.invoice import InvoiceStatus, PaymentMethod
from app.schemas.quotation import SelectedOptionOut


class InvoiceItemOut(BaseModel):
    id: int
    product_id: Optional[int] = None
    # The row as the bill prints it: item with the chosen options (a bill book reads "Bill Book - 1/4 (...)"), or as edited
    description: Optional[str] = None
    quantity: int
    area_sqft: Optional[float]
    unit_price: float
    total_price: float
    spec_notes: Optional[str] = None
    hsn_code: Optional[str] = None
    tax_rate: float = 0.0
    tax_amount: float = 0.0
    discount_amount: float = 0.0
    card_amount: Optional[float] = None
    card_amount_mode: Optional[str] = None
    printing_charge_manual: Optional[float] = None
    option_texts: Optional[Dict[str, str]] = None
    particulars: Optional[str] = None
    cgst_rate: Optional[float] = None
    sgst_rate: Optional[float] = None
    cgst_amount: Optional[float] = None
    sgst_amount: Optional[float] = None
    price_breakdown: Optional[List[Dict[str, Any]]] = None
    selected_options: List[SelectedOptionOut] = []

    class Config:
        from_attributes = True


class InvoiceStatusUpdate(BaseModel):
    status: InvoiceStatus


class PaymentCreate(BaseModel):
    amount: float
    method: PaymentMethod
    reference_number: Optional[str] = None
    upi_id: Optional[str] = None
    bank_details: Optional[str] = None
    notes: Optional[str] = None
    is_advance: bool = False


class PaymentOut(PaymentCreate):
    id: int
    has_proof: bool = False
    payment_date: date
    created_at: datetime

    class Config:
        from_attributes = True


class InvoiceOut(BaseModel):
    id: int
    invoice_number: str
    bill_no: Optional[int] = None
    quotation_id: int
    customer_id: int
    tax_id: Optional[int]
    subtotal: float
    discount_type: Optional[str] = None
    discount_value: float = 0.0
    discount_amount: float = 0.0
    adjustment_amount: float = 0.0
    tax_amount: float
    grand_total: float
    amount_paid: float
    status: InvoiceStatus
    with_gst: bool = False
    invoice_date: date
    notes: Optional[str]
    pay_by_date: Optional[date] = None
    bill_to_name: Optional[str] = None
    bill_to_address: Optional[str] = None
    bill_to_gstin: Optional[str] = None
    bill_to_phone: Optional[str] = None
    last_edited_at: Optional[datetime] = None
    last_edited_by: Optional[str] = None
    created_at: datetime
    items: List[InvoiceItemOut]
    payments: List[PaymentOut]

    class Config:
        from_attributes = True

class InvoicePatch(BaseModel):
    """What can be changed on an invoice after it is made: the day the customer promised to pay the balance."""
    pay_by_date: Optional[date] = None
    notes: Optional[str] = None



class InvoiceEditLine(BaseModel):
    """One row of the invoice as edited: particulars, HSN / SAC, quantity, rate and the CGST / SGST percentages."""
    id: Optional[int] = None  # an existing row; blank = a new row added on the invoice
    particulars: str = Field(min_length=1, max_length=1000)
    hsn_code: Optional[str] = Field(default=None, max_length=30)
    quantity: int = Field(ge=1, le=100_000_000)
    unit_price: float = Field(ge=0, le=100_000_000)
    cgst_rate: float = Field(default=0.0, ge=0, le=50)
    sgst_rate: float = Field(default=0.0, ge=0, le=50)

    @field_validator("particulars")
    @classmethod
    def _not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("The particulars cannot be empty")
        return v


class InvoiceEditRequest(BaseModel):
    """The whole invoice as it should read after editing (customer details, date, rows, an optional typed final amount)."""
    bill_to_name: Optional[str] = Field(default=None, max_length=200)
    bill_to_address: Optional[str] = Field(default=None, max_length=500)
    bill_to_gstin: Optional[str] = Field(default=None, max_length=20)
    bill_to_phone: Optional[str] = Field(default=None, max_length=30)
    invoice_date: Optional[date] = None
    notes: Optional[str] = Field(default=None, max_length=1000)
    final_amount: Optional[float] = Field(default=None, ge=0)
    items: List[InvoiceEditLine] = Field(min_length=1, max_length=60)


class InvoiceEditLineOut(BaseModel):
    id: Optional[int] = None
    particulars: str
    hsn_code: Optional[str] = None
    quantity: int
    unit_price: float
    amount: float
    discount_amount: float = 0.0
    cgst_rate: float = 0.0
    sgst_rate: float = 0.0
    cgst_amount: float = 0.0
    sgst_amount: float = 0.0
    total: float


class InvoiceEditPreview(BaseModel):
    """Every figure worked out again, so the edit window and the saved invoice always agree."""
    lines: List[InvoiceEditLineOut]
    subtotal: float
    discount_amount: float
    taxable_amount: float
    tax_amount: float
    computed_total: float
    adjustment_amount: float
    grand_total: float
    amount_paid: float
    balance: float


class InvoiceEditForm(BaseModel):
    """What the edit window starts with: the invoice as it prints today."""
    invoice_id: int
    with_gst: bool
    bill_to_name: str
    bill_to_address: str
    bill_to_gstin: str
    bill_to_phone: str
    invoice_date: date
    notes: Optional[str] = None
    final_amount: Optional[float] = None
    amount_paid: float
    items: List[InvoiceEditLine]
    history: List[Dict[str, Any]] = []
