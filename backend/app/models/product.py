from sqlalchemy import Column, Integer, String, Float, Boolean, ForeignKey, DateTime, Enum
from datetime import datetime
import enum
from app.core.database import Base


class ProductCategory(Base):
    __tablename__ = "product_categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    is_active = Column(Boolean, default=True)


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
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
