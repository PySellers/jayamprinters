from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import require_role
from app.models.print_charge import PrintChargeBand
from app.models.product import ProductCategory
from app.models.user import UserRole

router = APIRouter(prefix="/print-charge-bands", tags=["print-charge-bands"])
admin_write = [Depends(require_role(UserRole.admin))]


class BandIn(BaseModel):
    min_quantity: int = Field(ge=1)
    max_quantity: Optional[int] = Field(default=None, ge=1)
    amount: float = Field(ge=0)
    per_block: bool = False
    block_size: Optional[int] = Field(default=None, ge=1)


class BandOut(BandIn):
    id: int

    class Config:
        from_attributes = True


def _validate(bands: List[BandIn]) -> List[BandIn]:
    """Bands must start at or above 1, not overlap, and only the last one may be open-ended."""
    ordered = sorted(bands, key=lambda b: b.min_quantity)
    for i, band in enumerate(ordered):
        if band.max_quantity is not None and band.max_quantity < band.min_quantity:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A band cannot end before it starts")
        if band.per_block and not band.block_size:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A 'for each block' band needs the block size")
        if i < len(ordered) - 1:
            if band.max_quantity is None:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only the last band can have no upper limit")
            if ordered[i + 1].min_quantity <= band.max_quantity:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"The bands {band.min_quantity}-{band.max_quantity} and {ordered[i + 1].min_quantity} overlap",
                )
    return ordered


@router.get("/", response_model=List[BandOut])
def list_bands(category_id: int, db: Session = Depends(get_db)):
    return (
        db.query(PrintChargeBand).filter(PrintChargeBand.category_id == category_id)
        .order_by(PrintChargeBand.min_quantity).all()
    )


@router.put("/{category_id}", response_model=List[BandOut], dependencies=admin_write)
def replace_bands(category_id: int, bands: List[BandIn], db: Session = Depends(get_db)):
    """Saves the whole printing-charge table of a service in one go."""
    if not db.query(ProductCategory.id).filter(ProductCategory.id == category_id).first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product category not found")
    ordered = _validate(bands)
    db.query(PrintChargeBand).filter(PrintChargeBand.category_id == category_id).delete()
    for band in ordered:
        db.add(PrintChargeBand(category_id=category_id, **band.model_dump()))
    db.commit()
    return (
        db.query(PrintChargeBand).filter(PrintChargeBand.category_id == category_id)
        .order_by(PrintChargeBand.min_quantity).all()
    )
