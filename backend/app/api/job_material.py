"""Stock used by a job: adding a row takes the quantity out of the stock item, removing it puts it back."""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.job_card import JobCard
from app.models.job_material import JobMaterial
from app.models.purchase import InventoryItem
from app.models.user import User

job_router = APIRouter(prefix="/job-cards", tags=["job-materials"])
material_router = APIRouter(prefix="/job-materials", tags=["job-materials"])


class MaterialIn(BaseModel):
    inventory_item_id: int
    quantity: float = Field(gt=0)
    note: Optional[str] = None


class MaterialOut(BaseModel):
    id: int
    job_card_id: int
    inventory_item_id: int
    item_name: str
    unit: str
    quantity: float
    note: Optional[str] = None
    created_by: Optional[str] = None
    customer_name: Optional[str] = None  # the item is this customer's own material
    stock_left: float = 0.0
    low_stock: bool = False


def _out(row: JobMaterial) -> MaterialOut:
    item = row.inventory_item
    qty = item.current_qty or 0.0
    return MaterialOut(
        id=row.id, job_card_id=row.job_card_id, inventory_item_id=row.inventory_item_id, item_name=item.name, unit=item.unit,
        quantity=row.quantity, note=row.note, created_by=row.created_by,
        customer_name=item.customer.name if item.customer is not None else None,
        stock_left=qty, low_stock=item.customer_id is None and qty <= (item.reorder_threshold or 0),
    )


@job_router.get("/{job_card_id}/materials", response_model=List[MaterialOut])
def list_materials(job_card_id: int, db: Session = Depends(get_db)):
    rows = db.query(JobMaterial).filter(JobMaterial.job_card_id == job_card_id).order_by(JobMaterial.id).all()
    return [_out(r) for r in rows]


@job_router.post("/{job_card_id}/materials", response_model=MaterialOut, status_code=status.HTTP_201_CREATED)
def use_material(job_card_id: int, data: MaterialIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not db.query(JobCard.id).filter(JobCard.id == job_card_id).first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job card not found")
    item = db.query(InventoryItem).filter(InventoryItem.id == data.inventory_item_id).with_for_update().first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stock item not found")
    left = item.current_qty or 0.0
    if data.quantity > left + 1e-9:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Only {left:g} {item.unit} of {item.name} is in stock - buy more first (Purchases) or use a smaller quantity",
        )
    item.current_qty = round(left - data.quantity, 4)
    row = JobMaterial(job_card_id=job_card_id, inventory_item_id=item.id, quantity=data.quantity, note=(data.note or "").strip() or None, created_by=user.name)
    db.add(row)
    db.commit()
    db.refresh(row)
    return _out(row)


@material_router.delete("/{material_id}", status_code=status.HTTP_204_NO_CONTENT)
def put_material_back(material_id: int, db: Session = Depends(get_db)):
    row = db.query(JobMaterial).filter(JobMaterial.id == material_id).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    item = db.query(InventoryItem).filter(InventoryItem.id == row.inventory_item_id).with_for_update().first()
    if item:
        item.current_qty = round((item.current_qty or 0.0) + row.quantity, 4)
    db.delete(row)
    db.commit()
    return None
