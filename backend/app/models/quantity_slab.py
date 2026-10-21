from sqlalchemy import Boolean, Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base


class QuantitySlab(Base):
    __tablename__ = "quantity_slabs"

    id = Column(Integer, primary_key=True, index=True)
    category_id = Column(Integer, ForeignKey("product_categories.id"))
    min_quantity = Column(Integer)
    max_quantity = Column(Integer, nullable=True)
    label = Column(String, nullable=True)
    display_order = Column(Integer, default=0)
    # True = each band prices only its own units ("1st 1000 at rate A, each additional
    # unit at rate B"); False = the matched band's rate applies to the whole quantity.
    is_incremental = Column(Boolean, nullable=False, default=False)

    category = relationship("ProductCategory")
