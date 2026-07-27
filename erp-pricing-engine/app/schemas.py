"""Pydantic request/response models for the catalog and quote APIs."""
from datetime import datetime, date
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel


class QuoteRequest(BaseModel):
    category_code: str
    quantity: int
    selected_options: dict[str, str] = {}
    extra_codes: list[str] = []


class ExtraChargeBreakdown(BaseModel):
    code: str
    name: str
    amount: Decimal


class QuoteResponse(BaseModel):
    category_code: str
    quantity: int
    slab_label: str
    base_rate_per_unit: Decimal
    subtotal: Decimal
    extras: list[ExtraChargeBreakdown]
    extras_total: Decimal
    total: Decimal


class CategoryOut(BaseModel):
    id: int
    code: str
    name: str
    pricing_mode: str

    class Config:
        from_attributes = True


class SKUProductOut(BaseModel):
    id: int
    sku_code: str
    name: str
    price: Decimal

    class Config:
        from_attributes = True


class AttributeOptionOut(BaseModel):
    id: int
    value: str
    cost_delta_per_unit: Decimal

    class Config:
        from_attributes = True


class AttributeOut(BaseModel):
    code: str
    name: str
    options: list[AttributeOptionOut]

    class Config:
        from_attributes = True


class ExtraChargeOut(BaseModel):
    code: str
    name: str
    charge_type: str
    amount: Decimal
    minimum_amount: Optional[Decimal] = None

    class Config:
        from_attributes = True


class QuantitySlabOut(BaseModel):
    id: int
    label: str
    min_qty: int
    max_qty: Optional[int] = None
    is_additional_block: bool

    class Config:
        from_attributes = True


# ----------------------------- Catalog admin (price/option management) -----------------------------

class PriceMatrixCellOut(BaseModel):
    id: int
    slab_id: int
    slab_label: Optional[str] = None
    attribute_selector: dict
    base_rate: Decimal

    class Config:
        from_attributes = True


class PriceMatrixCellUpdate(BaseModel):
    base_rate: Decimal


class AttributeOptionIn(BaseModel):
    value: str
    cost_delta_per_unit: Decimal = Decimal("0")


class ExtraChargeUpdate(BaseModel):
    amount: Optional[Decimal] = None
    minimum_amount: Optional[Decimal] = None


class SKUProductIn(BaseModel):
    sku_code: str
    name: str
    price: Decimal


class SKUProductUpdate(BaseModel):
    name: Optional[str] = None
    price: Optional[Decimal] = None


# ----------------------------- Party -----------------------------

class PartyIn(BaseModel):
    name: str
    mobile: Optional[str] = None
    alt_mobile: Optional[str] = None
    address: Optional[str] = None


class PartyOut(PartyIn):
    id: int

    class Config:
        from_attributes = True


# ----------------------------- Job Card -----------------------------

class JobCardCreate(BaseModel):
    category_code: str
    quantity: int
    selected_options: dict[str, str] = {}
    extra_codes: list[str] = []
    order_taken_by: Optional[str] = None
    delivery_due_at: Optional[datetime] = None
    party_id: Optional[int] = None
    party: Optional[PartyIn] = None   # inline new-party creation if party_id not given


class JobCardOut(BaseModel):
    id: int
    job_number: str
    order_number: Optional[str] = None
    party: Optional[PartyOut] = None
    category_code: str
    quantity: int
    selected_options: dict
    selected_extra_codes: list
    computed_total: Optional[Decimal] = None
    stage: str
    order_taken_by: Optional[str] = None
    dtp_by: Optional[str] = None
    machine_man_by: Optional[str] = None
    rubber_stamp_by: Optional[str] = None
    numbering_by: Optional[str] = None
    binding_by: Optional[str] = None
    proof_verified_customer_by: Optional[str] = None
    proof_verified_press_by: Optional[str] = None
    delivery_due_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    price_breakdown: Optional[QuoteResponse] = None

    class Config:
        from_attributes = True


class JobStageUpdate(BaseModel):
    stage: str
    # optional: record who performed the stage being moved TO, straight into
    # the matching *_by field (e.g. stage="dtp" + assignee_name="Kumar" sets dtp_by)
    assignee_name: Optional[str] = None


class JobAssigneeUpdate(BaseModel):
    """Directly set one of the per-stage staff-attribution fields, independent
    of moving the job's current stage forward."""
    field: str   # one of: dtp_by, machine_man_by, rubber_stamp_by, numbering_by,
                 # binding_by, proof_verified_customer_by, proof_verified_press_by
    name: str


# ----------------------------- Orders (multi-item cart / checkout) -----------------------------

class OrderItemIn(BaseModel):
    category_code: str
    quantity: int
    selected_options: dict[str, str] = {}
    extra_codes: list[str] = []


class OrderCreate(BaseModel):
    source: str = "counter"   # "counter" or "online"
    order_taken_by: Optional[str] = None
    party_id: Optional[int] = None
    party: Optional[PartyIn] = None
    items: list[OrderItemIn]


class OrderOut(BaseModel):
    order_number: str
    source: str
    status: str = "active"
    party: Optional[PartyOut] = None
    created_at: Optional[datetime] = None
    items: list[JobCardOut]
    grand_total: Decimal
    paid_amount: Decimal = Decimal("0")
    balance_due: Decimal = Decimal("0")

    class Config:
        from_attributes = True


class PaymentIn(BaseModel):
    amount: Decimal


# ----------------------------- Reminders -----------------------------

class ReminderItem(BaseModel):
    job_number: str
    order_number: Optional[str] = None
    category_code: str
    party_name: Optional[str] = None
    stage: str
    delivery_due_at: Optional[datetime] = None
    reason: str   # "overdue" | "due_soon" | "unpaid_balance"
    balance_due: Optional[Decimal] = None


class ReminderList(BaseModel):
    generated_at: datetime
    items: list[ReminderItem]


# ----------------------------- Accounts / Finance -----------------------------

class CashTransactionIn(BaseModel):
    txn_type: str   # "receipt" | "payment" | "bank_deposit"
    amount: Decimal
    note: Optional[str] = None
    created_by: Optional[str] = None


class CashTransactionOut(CashTransactionIn):
    id: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class CashSummary(BaseModel):
    cash_in_hand: Decimal
    cash_moved_to_bank: Decimal
    transactions: list[CashTransactionOut]


class ChequeTransactionIn(BaseModel):
    direction: str   # "deposited" | "issued"
    cheque_no: str
    cheque_date: Optional[date] = None
    bank_branch: Optional[str] = None
    deposit_date: Optional[date] = None
    amount: Decimal
    status: str = "pending"


class ChequeTransactionOut(ChequeTransactionIn):
    id: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ChequeStatusUpdate(BaseModel):
    status: str   # "pending" | "cleared" | "bounced"


class VendorBillIn(BaseModel):
    bill_no: str
    vendor_name: str
    cash_value: Decimal
    paid_amount: Decimal = Decimal("0")
    bill_date: Optional[date] = None


class VendorBillOut(VendorBillIn):
    id: int
    balance: Decimal
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class InventoryItemIn(BaseModel):
    name: str
    unit: str = "sheets"
    current_qty: Decimal = Decimal("0")
    reorder_threshold: Decimal = Decimal("0")


class InventoryItemOut(InventoryItemIn):
    id: int
    low_stock: bool

    class Config:
        from_attributes = True


# ----------------------------- Reports -----------------------------

class ReportPoint(BaseModel):
    label: str
    order_count: int
    total_sales: Decimal


class ReportSummary(BaseModel):
    range: str
    points: list[ReportPoint]
    grand_total: Decimal
    total_orders: int
