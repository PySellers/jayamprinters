from sqlalchemy import Column, Integer, String, Float, Boolean, ForeignKey, DateTime, Enum
from datetime import datetime
import enum
from app.core.database import Base


class ProductCategory(Base):
    __tablename__ = "product_categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    is_active = Column(Boolean, default=True)
    # Set for services that use a dedicated step-by-step order screen (e.g. 'bill_book').
    guided_flow = Column(String, nullable=True)
    # Smallest amount billed for one line of this service (small runs cost more per unit).
    min_charge = Column(Float, nullable=True)
    # Default HSN / SAC (and so GST rate) for everything sold under this service.
    hsn_id = Column(Integer, ForeignKey("hsn_codes.id"), nullable=True)
    # Printing charge, on top of the paper cost: 'block' = a fixed rate per block of copies (minimum one block),
    # 'per_copy' = a rate per copy. Blank = no separate printing charge.
    print_charge_mode = Column(String, nullable=True)
    print_block_size = Column(Integer, nullable=True)
    print_block_rate = Column(Float, nullable=True)
    print_per_copy_rate = Column(Float, nullable=True)
    print_per_layer = Column(Boolean, nullable=False, default=False, server_default="false")


class ProductPricingType(str, enum.Enum):
    matrix = "matrix"
    fixed = "fixed"
    per_area = "per_area"


class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    category_id = Column(Integer, ForeignKey("product_categories.id"), nullable=True)
    description = Column(String, nullable=True)
    pricing_type = Column(Enum(ProductPricingType), default=ProductPricingType.matrix)
    fixed_price = Column(Float, nullable=True)
    hsn_id = Column(Integer, ForeignKey("hsn_codes.id"), nullable=True)  # overrides the service's HSN
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
