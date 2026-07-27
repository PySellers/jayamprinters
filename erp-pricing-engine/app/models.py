"""
SQLAlchemy models implementing Section 6 of the blueprint doc:
ProductCategory / Attribute / AttributeOption / QuantitySlab / PriceMatrixCell /
ExtraCharge / SKUProduct / PriceListVersion / Party / JobCard.
"""
import enum
from datetime import date, datetime

from sqlalchemy import (
    Column, Integer, String, Numeric, Boolean, ForeignKey, Date, DateTime,
    JSON, Enum, UniqueConstraint, func,
)
from sqlalchemy.orm import relationship

from app.database import Base


class PricingMode(str, enum.Enum):
    MATRIX = "matrix"   # price resolved from size x material x quantity-slab table
    SKU = "sku"         # flat price per fixed catalogue item (e.g. rubber stamps)


class ChargeType(str, enum.Enum):
    FLAT = "flat"               # one-time charge regardless of quantity
    PER_UNIT = "per_unit"       # charge x quantity
    PER_1000 = "per_1000"       # charge per started block of 1000 units


class JobStage(str, enum.Enum):
    ORDER_TAKEN = "order_taken"
    DTP = "dtp"
    PROOF_CUSTOMER = "proof_customer"
    PROOF_PRESS = "proof_press"
    PRINTING = "printing"
    FINISHING = "finishing"      # stamp / numbering / binding / lamination / foiling
    DISPATCHED = "dispatched"


class OrderSource(str, enum.Enum):
    COUNTER = "counter"    # entered by staff at the shop
    ONLINE = "online"      # placed by the customer through the storefront


class OrderStatus(str, enum.Enum):
    ACTIVE = "active"
    CANCELLED = "cancelled"


class UserRole(str, enum.Enum):
    ADMIN = "admin"          # full access: prices, catalog admin, cancel/delete, all reports
    COUNTER = "counter"      # order entry, job board
    PRODUCTION = "production"  # job board / stage updates only
    ACCOUNTS = "accounts"    # accounts/finance module + reports


class CashTxnType(str, enum.Enum):
    RECEIPT = "receipt"              # cash received (e.g. against an order)
    PAYMENT = "payment"              # cash paid out (expense)
    BANK_DEPOSIT = "bank_deposit"    # cash moved from hand to bank


class ChequeDirection(str, enum.Enum):
    DEPOSITED = "deposited"   # a cheque the shop received and is banking
    ISSUED = "issued"         # a cheque the shop wrote to someone else


class ChequeStatus(str, enum.Enum):
    PENDING = "pending"
    CLEARED = "cleared"
    BOUNCED = "bounced"


class PriceListVersion(Base):
    __tablename__ = "price_list_versions"

    id = Column(Integer, primary_key=True)
    name = Column(String(120), nullable=False)          # e.g. "Rate Card 2026-04"
    effective_from = Column(Date, nullable=False, default=date.today)
    is_active = Column(Boolean, default=True)


class ProductCategory(Base):
    __tablename__ = "product_categories"

    id = Column(Integer, primary_key=True)
    code = Column(String(50), unique=True, nullable=False)     # e.g. VISITING_CARD
    name = Column(String(150), nullable=False)
    pricing_mode = Column(Enum(PricingMode), nullable=False, default=PricingMode.MATRIX)

    attributes = relationship("Attribute", back_populates="category", cascade="all, delete-orphan")
    slabs = relationship("QuantitySlab", back_populates="category", cascade="all, delete-orphan")
    matrix_cells = relationship("PriceMatrixCell", back_populates="category", cascade="all, delete-orphan")
    extra_charges = relationship("ExtraCharge", back_populates="category", cascade="all, delete-orphan")
    sku_products = relationship("SKUProduct", back_populates="category", cascade="all, delete-orphan")


class Attribute(Base):
    """A configurable dimension of a category, e.g. Size, Paper, GSM, Lamination, Side."""
    __tablename__ = "attributes"

    id = Column(Integer, primary_key=True)
    category_id = Column(Integer, ForeignKey("product_categories.id"), nullable=False)
    code = Column(String(50), nullable=False)     # e.g. LAMINATION
    name = Column(String(150), nullable=False)    # e.g. "Lamination"

    category = relationship("ProductCategory", back_populates="attributes")
    options = relationship("AttributeOption", back_populates="attribute", cascade="all, delete-orphan")

    __table_args__ = (UniqueConstraint("category_id", "code", name="uq_attribute_category_code"),)


class AttributeOption(Base):
    """An allowed value for an attribute, optionally with its own cost delta."""
    __tablename__ = "attribute_options"

    id = Column(Integer, primary_key=True)
    attribute_id = Column(Integer, ForeignKey("attributes.id"), nullable=False)
    value = Column(String(100), nullable=False)             # e.g. "3D", "130 GSM"
    cost_delta_per_unit = Column(Numeric(10, 2), nullable=False, default=0)

    attribute = relationship("Attribute", back_populates="options")

    __table_args__ = (UniqueConstraint("attribute_id", "value", name="uq_option_attribute_value"),)


class QuantitySlab(Base):
    """A quantity break-point, e.g. '1-500', '501-1000', or 'Additional per 1000'."""
    __tablename__ = "quantity_slabs"

    id = Column(Integer, primary_key=True)
    category_id = Column(Integer, ForeignKey("product_categories.id"), nullable=False)
    label = Column(String(50), nullable=False)
    min_qty = Column(Integer, nullable=False)
    max_qty = Column(Integer, nullable=True)   # null => open-ended / "additional block" slab
    is_additional_block = Column(Boolean, default=False)   # true => rate applies per extra block

    category = relationship("ProductCategory", back_populates="slabs")


class PriceMatrixCell(Base):
    """
    Resolved base rate for one specific combination of attribute selections + a
    quantity slab, within a given category and price-list version.

    `attribute_selector` is a JSON dict of {attribute_code: option_value}, e.g.
    {"SIZE": "13x19", "PAPER": "Art", "GSM": "130"}. The pricing engine matches
    on subset containment against the customer's selected options.
    """
    __tablename__ = "price_matrix_cells"

    id = Column(Integer, primary_key=True)
    category_id = Column(Integer, ForeignKey("product_categories.id"), nullable=False)
    slab_id = Column(Integer, ForeignKey("quantity_slabs.id"), nullable=False)
    price_list_version_id = Column(Integer, ForeignKey("price_list_versions.id"), nullable=True)
    attribute_selector = Column(JSON, nullable=False, default=dict)
    base_rate = Column(Numeric(10, 4), nullable=False)   # rate per unit within this slab

    category = relationship("ProductCategory", back_populates="matrix_cells")
    slab = relationship("QuantitySlab")


class ExtraCharge(Base):
    """Additive add-on independent of the base matrix, e.g. foiling, pasting, transport."""
    __tablename__ = "extra_charges"

    id = Column(Integer, primary_key=True)
    category_id = Column(Integer, ForeignKey("product_categories.id"), nullable=False)
    code = Column(String(50), nullable=False)        # e.g. FOILING
    name = Column(String(150), nullable=False)
    charge_type = Column(Enum(ChargeType), nullable=False, default=ChargeType.FLAT)
    amount = Column(Numeric(10, 2), nullable=False)
    minimum_amount = Column(Numeric(10, 2), nullable=True)

    category = relationship("ProductCategory", back_populates="extra_charges")

    __table_args__ = (UniqueConstraint("category_id", "code", name="uq_extra_category_code"),)


class SKUProduct(Base):
    """Fixed-price catalogue item bypassing the matrix (e.g. rubber-stamp size codes)."""
    __tablename__ = "sku_products"

    id = Column(Integer, primary_key=True)
    category_id = Column(Integer, ForeignKey("product_categories.id"), nullable=False)
    sku_code = Column(String(50), nullable=False)     # e.g. "A1_25X8"
    name = Column(String(150), nullable=False)        # e.g. "Polymer Stamp 25x8mm"
    price = Column(Numeric(10, 2), nullable=False)

    category = relationship("ProductCategory", back_populates="sku_products")

    __table_args__ = (UniqueConstraint("category_id", "sku_code", name="uq_sku_category_code"),)


class Party(Base):
    """Customer master."""
    __tablename__ = "parties"

    id = Column(Integer, primary_key=True)
    name = Column(String(150), nullable=False)
    mobile = Column(String(20), nullable=True)
    alt_mobile = Column(String(20), nullable=True)
    address = Column(String(300), nullable=True)


class User(Base):
    """
    Staff login for role-gating. NOTE: this is a standalone, minimal auth model
    for this scaffold only -- the real project already has working
    register/login (per the FastAPI+React demo). On merge, drop this table and
    reuse that app's user/auth system instead, just carrying over the `role`
    concept and the `require_role()` dependency pattern from app/auth.py.
    """
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    username = Column(String(80), unique=True, nullable=False)
    password_hash = Column(String(200), nullable=False)
    role = Column(Enum(UserRole), nullable=False, default=UserRole.COUNTER)
    full_name = Column(String(150), nullable=True)
    created_at = Column(DateTime, server_default=func.now())


class Order(Base):
    """
    A single checkout/bill event that can bundle several JobCards (one per
    product line), e.g. a customer orders 500 visiting cards AND 200 letterheads
    in one online checkout -> one Order, two JobCards.
    """
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True)
    order_number = Column(String(30), unique=True, nullable=False)
    party_id = Column(Integer, ForeignKey("parties.id"), nullable=True)
    source = Column(Enum(OrderSource), nullable=False, default=OrderSource.COUNTER)
    status = Column(Enum(OrderStatus), nullable=False, default=OrderStatus.ACTIVE)
    paid_amount = Column(Numeric(12, 2), nullable=False, default=0)
    created_at = Column(DateTime, server_default=func.now())

    party = relationship("Party")
    job_cards = relationship("JobCard", back_populates="order")


class JobCard(Base):
    """
    One product line within an order: chosen category + attribute values +
    computed price + production-stage checklist (from the rate card's
    job-status board).
    """
    __tablename__ = "job_cards"

    id = Column(Integer, primary_key=True)
    job_number = Column(String(30), unique=True, nullable=False)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=True)
    party_id = Column(Integer, ForeignKey("parties.id"), nullable=True)
    category_id = Column(Integer, ForeignKey("product_categories.id"), nullable=False)
    quantity = Column(Integer, nullable=False)
    selected_options = Column(JSON, nullable=False, default=dict)
    selected_extra_codes = Column(JSON, nullable=False, default=list)
    computed_total = Column(Numeric(12, 2), nullable=True)
    stage = Column(Enum(JobStage), nullable=False, default=JobStage.ORDER_TAKEN)
    delivery_due_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    # Per-stage staff attribution, straight off the rate-card PDF's Home-page
    # mockup (Order Taken By / DTP / Machine Man / Rubber Stamp / Numbering /
    # Binding / Proof Verified-Customer / Proof Verified-Press). Filled in as
    # the job physically moves through the shop, independent of `stage` above
    # (which just tracks where it currently is).
    order_taken_by = Column(String(100), nullable=True)
    dtp_by = Column(String(100), nullable=True)
    machine_man_by = Column(String(100), nullable=True)
    rubber_stamp_by = Column(String(100), nullable=True)
    numbering_by = Column(String(100), nullable=True)
    binding_by = Column(String(100), nullable=True)
    proof_verified_customer_by = Column(String(100), nullable=True)
    proof_verified_press_by = Column(String(100), nullable=True)

    category = relationship("ProductCategory")
    party = relationship("Party")
    order = relationship("Order", back_populates="job_cards")


# ---------------------------------------------------------------------------
# Accounts / Finance module (Sales Report page of the rate-card PDF: Cash in
# Hand, Cash in Bank incl. cheque deposit/issue, Stock Value / vendor bills,
# Low Stock).
# ---------------------------------------------------------------------------

class CashTransaction(Base):
    """A single cash movement. Running cash-in-hand balance is
    receipts - payments - bank_deposits, computed in the reports router."""
    __tablename__ = "cash_transactions"

    id = Column(Integer, primary_key=True)
    txn_type = Column(Enum(CashTxnType), nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    note = Column(String(255), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    created_by = Column(String(100), nullable=True)


class ChequeTransaction(Base):
    """Cheque deposited (customer paid by cheque) or issued (shop paid a
    vendor by cheque), with the full lifecycle fields from the PDF."""
    __tablename__ = "cheque_transactions"

    id = Column(Integer, primary_key=True)
    direction = Column(Enum(ChequeDirection), nullable=False)
    cheque_no = Column(String(50), nullable=False)
    cheque_date = Column(Date, nullable=True)
    bank_branch = Column(String(150), nullable=True)
    deposit_date = Column(Date, nullable=True)
    amount = Column(Numeric(12, 2), nullable=False)
    status = Column(Enum(ChequeStatus), nullable=False, default=ChequeStatus.PENDING)
    created_at = Column(DateTime, server_default=func.now())


class VendorBill(Base):
    """A purchase bill from a paper/ink/board vendor -- feeds the PDF's
    'Stock Value' report (Bill No. / Vendor Name / Cash Value / Paid-Balance)."""
    __tablename__ = "vendor_bills"

    id = Column(Integer, primary_key=True)
    bill_no = Column(String(50), nullable=False)
    vendor_name = Column(String(150), nullable=False)
    cash_value = Column(Numeric(12, 2), nullable=False)
    paid_amount = Column(Numeric(12, 2), nullable=False, default=0)
    bill_date = Column(Date, nullable=True)
    created_at = Column(DateTime, server_default=func.now())


class InventoryItem(Base):
    """Minimal raw-material stock tracking for the PDF's 'Low Stock' alert."""
    __tablename__ = "inventory_items"

    id = Column(Integer, primary_key=True)
    name = Column(String(150), nullable=False)         # e.g. "Art Board 250 GSM"
    unit = Column(String(30), nullable=False, default="sheets")
    current_qty = Column(Numeric(12, 2), nullable=False, default=0)
    reorder_threshold = Column(Numeric(12, 2), nullable=False, default=0)
