from sqlalchemy import Boolean, Column, Float, ForeignKey, Integer
from sqlalchemy.orm import relationship
from app.core.database import Base


class PrintChargeBand(Base):
    """One row of a service's printing-charge table (Pricing Setup > Printing & Tax).

    The band that holds the number of pages printed decides the charge:
      * a plain band charges `amount` once ("up to 1,000: Rs.500");
      * a per-block band charges the charge at the top of the band before it, plus `amount`
        for every started block of `block_size` pages above `min_quantity` ("above 1,000: Rs.2,000 for each 1,000 more").
    """
    __tablename__ = "print_charge_bands"

    id = Column(Integer, primary_key=True, index=True)
    category_id = Column(Integer, ForeignKey("product_categories.id", ondelete="CASCADE"), index=True, nullable=False)
    min_quantity = Column(Integer, nullable=False)
    max_quantity = Column(Integer, nullable=True)  # blank = no upper limit
    amount = Column(Float, nullable=False, default=0.0)
    per_block = Column(Boolean, nullable=False, default=False, server_default="false")
    block_size = Column(Integer, nullable=True)

    category = relationship("ProductCategory")
