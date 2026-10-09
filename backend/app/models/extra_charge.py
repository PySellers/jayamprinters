from sqlalchemy import Column, Integer, String, Float, Boolean, ForeignKey, Enum
from sqlalchemy.orm import relationship
import enum
from app.core.database import Base


class ChargeType(str, enum.Enum):
    flat = "flat"
    per_unit = "per_unit"
    per_sqft = "per_sqft"
    percentage = "percentage"


class ExtraCharge(Base):
    __tablename__ = "extra_charges"

    id = Column(Integer, primary_key=True, index=True)
    category_id = Column(Integer, ForeignKey("product_categories.id"), nullable=True)
    name = Column(String, index=True)
    charge_type = Column(Enum(ChargeType))
    amount = Column(Float)
    is_active = Column(Boolean, default=True)
    # Charges sharing a group_name are mutually exclusive (pick at most one), e.g. 'Bill Type'.
    group_name = Column(String, nullable=True)
    # If set, this charge only applies when that attribute option is selected
    # (e.g. binding-set price that depends on the copies-per-set choice).
    requires_option_id = Column(Integer, ForeignKey("attribute_options.id"), nullable=True)

    category = relationship("ProductCategory")
