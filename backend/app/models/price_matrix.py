from sqlalchemy import Column, Integer, Float, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base


class PriceMatrixCell(Base):
    __tablename__ = "price_matrix_cells"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"))
    quantity_slab_id = Column(Integer, ForeignKey("quantity_slabs.id"))
    unit_price = Column(Float)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    product = relationship("Product")
    quantity_slab = relationship("QuantitySlab")
    options = relationship("PriceMatrixCellOption", back_populates="cell", cascade="all, delete-orphan")


class PriceMatrixCellOption(Base):
    __tablename__ = "price_matrix_cell_options"

    id = Column(Integer, primary_key=True, index=True)
    price_matrix_cell_id = Column(Integer, ForeignKey("price_matrix_cells.id"))
    attribute_id = Column(Integer, ForeignKey("attributes.id"))
    attribute_option_id = Column(Integer, ForeignKey("attribute_options.id"))

    cell = relationship("PriceMatrixCell", back_populates="options")
    attribute = relationship("Attribute")
    attribute_option = relationship("AttributeOption")
