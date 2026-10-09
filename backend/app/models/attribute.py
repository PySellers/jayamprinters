from sqlalchemy import Column, Integer, String, Float, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base


class Attribute(Base):
    __tablename__ = "attributes"

    id = Column(Integer, primary_key=True, index=True)
    category_id = Column(Integer, ForeignKey("product_categories.id"))
    name = Column(String, index=True)
    is_required = Column(Boolean, default=False)
    display_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    # False = a descriptive/surcharge choice (document type, paper brand, copies...)
    # that is NOT part of the price-matrix key. Its option extra_price still applies.
    in_price_matrix = Column(Boolean, default=True, nullable=False)

    category = relationship("ProductCategory")
    options = relationship("AttributeOption", back_populates="attribute", cascade="all, delete-orphan")


class AttributeOption(Base):
    __tablename__ = "attribute_options"

    id = Column(Integer, primary_key=True, index=True)
    attribute_id = Column(Integer, ForeignKey("attributes.id"))
    value = Column(String)
    extra_price = Column(Float, default=0.0)
    display_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)

    attribute = relationship("Attribute", back_populates="options")
