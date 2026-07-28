from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional

from app.core.database import get_db
from app.models.quantity_slab import QuantitySlab
from app.schemas.quantity_slab import QuantitySlabCreate, QuantitySlabUpdate, QuantitySlabOut

router = APIRouter(prefix="/quantity-slabs", tags=["quantity-slabs"])


@router.get("/", response_model=List[QuantitySlabOut])
def get_quantity_slabs(category_id: Optional[int] = None, db: Session = Depends(get_db)):
    query = db.query(QuantitySlab)
    if category_id is not None:
        query = query.filter(QuantitySlab.category_id == category_id)
    return query.order_by(QuantitySlab.display_order, QuantitySlab.min_quantity).all()


@router.get("/{slab_id}", response_model=QuantitySlabOut)
def get_quantity_slab(slab_id: int, db: Session = Depends(get_db)):
    slab = db.query(QuantitySlab).filter(QuantitySlab.id == slab_id).first()
    if not slab:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quantity slab not found")
    return slab


@router.post("/", response_model=QuantitySlabOut, status_code=status.HTTP_201_CREATED)
def create_quantity_slab(data: QuantitySlabCreate, db: Session = Depends(get_db)):
    slab = QuantitySlab(**data.model_dump())
    db.add(slab)
    db.commit()
    db.refresh(slab)
    return slab


@router.put("/{slab_id}", response_model=QuantitySlabOut)
def update_quantity_slab(slab_id: int, data: QuantitySlabUpdate, db: Session = Depends(get_db)):
    slab = db.query(QuantitySlab).filter(QuantitySlab.id == slab_id).first()
    if not slab:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quantity slab not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(slab, key, value)
    db.commit()
    db.refresh(slab)
    return slab


@router.delete("/{slab_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_quantity_slab(slab_id: int, db: Session = Depends(get_db)):
    slab = db.query(QuantitySlab).filter(QuantitySlab.id == slab_id).first()
    if not slab:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quantity slab not found")
    db.delete(slab)
    db.commit()
    return None
