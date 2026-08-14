from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional

from app.core.database import get_db
from app.core.security import require_role
from app.models.price_matrix import PriceMatrixCell, PriceMatrixCellOption
from app.models.user import UserRole
from app.schemas.price_matrix import PriceMatrixCellCreate, PriceMatrixCellUpdate, PriceMatrixCellOut, PriceMatrixCellBulkUpsert

router = APIRouter(prefix="/price-matrix-cells", tags=["price-matrix"])
# The actual rupee rates live here -- Admin-only writes, same reasoning as attributes.py.
admin_write = [Depends(require_role(UserRole.admin))]


def _find_duplicate(db: Session, product_id: int, quantity_slab_id: int, option_set, exclude_id: Optional[int] = None) -> Optional[PriceMatrixCell]:
    query = db.query(PriceMatrixCell).filter(
        PriceMatrixCell.product_id == product_id,
        PriceMatrixCell.quantity_slab_id == quantity_slab_id,
        PriceMatrixCell.is_active.is_(True),
    )
    if exclude_id is not None:
        query = query.filter(PriceMatrixCell.id != exclude_id)
    for cell in query.all():
        cell_set = {(o.attribute_id, o.attribute_option_id) for o in cell.options}
        if cell_set == option_set:
            return cell
    return None


@router.get("/", response_model=List[PriceMatrixCellOut])
def get_price_matrix_cells(product_id: Optional[int] = None, db: Session = Depends(get_db)):
    query = db.query(PriceMatrixCell)
    if product_id is not None:
        query = query.filter(PriceMatrixCell.product_id == product_id)
    return query.all()


@router.get("/{cell_id}", response_model=PriceMatrixCellOut)
def get_price_matrix_cell(cell_id: int, db: Session = Depends(get_db)):
    cell = db.query(PriceMatrixCell).filter(PriceMatrixCell.id == cell_id).first()
    if not cell:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Price matrix cell not found")
    return cell


@router.post("/", response_model=PriceMatrixCellOut, status_code=status.HTTP_201_CREATED, dependencies=admin_write)
def create_price_matrix_cell(data: PriceMatrixCellCreate, db: Session = Depends(get_db)):
    option_set = {(opt.attribute_id, opt.attribute_option_id) for opt in data.options}
    if _find_duplicate(db, data.product_id, data.quantity_slab_id, option_set):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An active price matrix cell already covers this exact product/slab/attribute combination",
        )
    cell = PriceMatrixCell(
        product_id=data.product_id,
        quantity_slab_id=data.quantity_slab_id,
        unit_price=data.unit_price,
        is_active=data.is_active,
    )
    db.add(cell)
    db.flush()
    for opt in data.options:
        db.add(PriceMatrixCellOption(price_matrix_cell_id=cell.id, **opt.model_dump()))
    db.commit()
    db.refresh(cell)
    return cell


@router.post("/bulk", response_model=List[PriceMatrixCellOut], dependencies=admin_write)
def bulk_upsert_price_matrix_cells(data: PriceMatrixCellBulkUpsert, db: Session = Depends(get_db)):
    """Create-or-update many cells in one request, for the bulk price-entry grid.

    Each item is matched to an existing active cell by (product_id, quantity_slab_id,
    exact option set); if found its unit_price is updated, otherwise a new cell is created.
    """
    results = []
    for item in data.cells:
        option_set = {(opt.attribute_id, opt.attribute_option_id) for opt in item.options}
        existing = _find_duplicate(db, item.product_id, item.quantity_slab_id, option_set)
        if existing:
            existing.unit_price = item.unit_price
            existing.is_active = item.is_active
            db.flush()
            results.append(existing)
        else:
            cell = PriceMatrixCell(
                product_id=item.product_id,
                quantity_slab_id=item.quantity_slab_id,
                unit_price=item.unit_price,
                is_active=item.is_active,
            )
            db.add(cell)
            db.flush()
            for opt in item.options:
                db.add(PriceMatrixCellOption(price_matrix_cell_id=cell.id, **opt.model_dump()))
            db.flush()
            results.append(cell)
    db.commit()
    for cell in results:
        db.refresh(cell)
    return results


@router.put("/{cell_id}", response_model=PriceMatrixCellOut, dependencies=admin_write)
def update_price_matrix_cell(cell_id: int, data: PriceMatrixCellUpdate, db: Session = Depends(get_db)):
    cell = db.query(PriceMatrixCell).filter(PriceMatrixCell.id == cell_id).first()
    if not cell:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Price matrix cell not found")

    is_active = data.is_active if data.is_active is not None else cell.is_active
    if is_active:
        slab_id = data.quantity_slab_id if data.quantity_slab_id is not None else cell.quantity_slab_id
        option_set = (
            {(opt.attribute_id, opt.attribute_option_id) for opt in data.options}
            if data.options is not None
            else {(o.attribute_id, o.attribute_option_id) for o in cell.options}
        )
        if _find_duplicate(db, cell.product_id, slab_id, option_set, exclude_id=cell_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="An active price matrix cell already covers this exact product/slab/attribute combination",
            )

    updates = data.model_dump(exclude_unset=True, exclude={"options"})
    for key, value in updates.items():
        setattr(cell, key, value)
    if data.options is not None:
        db.query(PriceMatrixCellOption).filter(PriceMatrixCellOption.price_matrix_cell_id == cell_id).delete()
        for opt in data.options:
            db.add(PriceMatrixCellOption(price_matrix_cell_id=cell_id, **opt.model_dump()))
    db.commit()
    db.refresh(cell)
    return cell


@router.delete("/{cell_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=admin_write)
def delete_price_matrix_cell(cell_id: int, db: Session = Depends(get_db)):
    cell = db.query(PriceMatrixCell).filter(PriceMatrixCell.id == cell_id).first()
    if not cell:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Price matrix cell not found")
    db.delete(cell)
    db.commit()
    return None
