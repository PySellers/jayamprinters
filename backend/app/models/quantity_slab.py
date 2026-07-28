from sqlalchemy import Column, Integer, String, ForeignKey
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

    category = relationship("ProductCategory")
