from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    ProductCategory, SKUProduct, Attribute, AttributeOption, ExtraCharge,
    QuantitySlab, PriceMatrixCell, UserRole,
)
from app.schemas import (
    CategoryOut, SKUProductOut, AttributeOut, ExtraChargeOut, QuantitySlabOut,
    PriceMatrixCellOut, PriceMatrixCellUpdate, AttributeOptionIn, ExtraChargeUpdate,
    SKUProductIn, SKUProductUpdate,
)
from app.auth import require_role

router = APIRouter(prefix="/catalog", tags=["catalog"])


def _get_category_or_404(category_code: str, db: Session) -> ProductCategory:
    category = db.query(ProductCategory).filter(ProductCategory.code == category_code).first()
    if category is None:
        raise HTTPException(status_code=404, detail=f"Unknown category '{category_code}'")
    return category


def _get_attribute_or_404(category: ProductCategory, attr_code: str, db: Session) -> Attribute:
    attr = db.query(Attribute).filter(Attribute.category_id == category.id, Attribute.code == attr_code).first()
    if attr is None:
        raise HTTPException(status_code=404, detail=f"Unknown attribute '{attr_code}' on '{category.code}'")
    return attr


# ----------------------------- Public / staff read endpoints -----------------------------

@router.get("/categories", response_model=list[CategoryOut])
def list_categories(db: Session = Depends(get_db)):
    return db.query(ProductCategory).all()


@router.get("/categories/{category_code}/skus", response_model=list[SKUProductOut])
def list_skus(category_code: str, db: Session = Depends(get_db)):
    category = _get_category_or_404(category_code, db)
    return db.query(SKUProduct).filter(SKUProduct.category_id == category.id).all()


@router.get("/categories/{category_code}/attributes", response_model=list[AttributeOut])
def list_attributes(category_code: str, db: Session = Depends(get_db)):
    """Attributes + their options, so a frontend can render the configurator
    form (size/paper/lamination dropdowns etc.) without hard-coding anything."""
    category = _get_category_or_404(category_code, db)
    attrs = db.query(Attribute).filter(Attribute.category_id == category.id).all()
    return attrs


@router.get("/categories/{category_code}/extras", response_model=list[ExtraChargeOut])
def list_extras(category_code: str, db: Session = Depends(get_db)):
    category = _get_category_or_404(category_code, db)
    return db.query(ExtraCharge).filter(ExtraCharge.category_id == category.id).all()


@router.get("/categories/{category_code}/slabs", response_model=list[QuantitySlabOut])
def list_slabs(category_code: str, db: Session = Depends(get_db)):
    category = _get_category_or_404(category_code, db)
    return db.query(QuantitySlab).filter(QuantitySlab.category_id == category.id).order_by(QuantitySlab.min_qty).all()


@router.get("/categories/{category_code}/price-cells", response_model=list[PriceMatrixCellOut])
def list_price_cells(category_code: str, db: Session = Depends(get_db)):
    """Every priced row for this category -- what the Catalog Admin screen
    edits. Read is open to any logged-in staff so counter/production can see
    what a price will be; only Admin can change it (below)."""
    category = _get_category_or_404(category_code, db)
    cells = db.query(PriceMatrixCell).filter(PriceMatrixCell.category_id == category.id).all()
    out = []
    for c in cells:
        slab = db.query(QuantitySlab).filter(QuantitySlab.id == c.slab_id).first()
        out.append(PriceMatrixCellOut(
            id=c.id, slab_id=c.slab_id, slab_label=slab.label if slab else None,
            attribute_selector=c.attribute_selector or {}, base_rate=c.base_rate,
        ))
    return out


# ----------------------------- Admin-only write endpoints -----------------------------
# Every mutation below requires UserRole.ADMIN -- this is the "admin page to
# enter price instead of making it public" the shop asked for. Catalog reads
# above stay open to any logged-in staff (counter needs to see prices too).

@router.patch("/price-cells/{cell_id}", response_model=PriceMatrixCellOut)
def update_price_cell(
    cell_id: int, payload: PriceMatrixCellUpdate, db: Session = Depends(get_db),
    user=Depends(require_role(UserRole.ADMIN)),
):
    cell = db.query(PriceMatrixCell).filter(PriceMatrixCell.id == cell_id).first()
    if cell is None:
        raise HTTPException(status_code=404, detail=f"Unknown price cell id {cell_id}")
    cell.base_rate = payload.base_rate
    db.commit()
    db.refresh(cell)
    slab = db.query(QuantitySlab).filter(QuantitySlab.id == cell.slab_id).first()
    return PriceMatrixCellOut(
        id=cell.id, slab_id=cell.slab_id, slab_label=slab.label if slab else None,
        attribute_selector=cell.attribute_selector or {}, base_rate=cell.base_rate,
    )


@router.post("/categories/{category_code}/attributes/{attr_code}/options", response_model=AttributeOptionIn, status_code=201)
def add_attribute_option(
    category_code: str, attr_code: str, payload: AttributeOptionIn, db: Session = Depends(get_db),
    user=Depends(require_role(UserRole.ADMIN)),
):
    """Add a new paper brand / size / finish etc. to an existing attribute --
    the shop's own note that "brand of paper, price and other details may vary"
    is handled here: this is a data entry, not a code change."""
    category = _get_category_or_404(category_code, db)
    attr = _get_attribute_or_404(category, attr_code, db)
    existing = db.query(AttributeOption).filter(
        AttributeOption.attribute_id == attr.id, AttributeOption.value == payload.value,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Option '{payload.value}' already exists on '{attr_code}'")
    option = AttributeOption(attribute_id=attr.id, value=payload.value, cost_delta_per_unit=payload.cost_delta_per_unit)
    db.add(option)
    db.commit()
    return payload


@router.delete("/options/{option_id}", status_code=204)
def remove_attribute_option(
    option_id: int, db: Session = Depends(get_db),
    user=Depends(require_role(UserRole.ADMIN)),
):
    option = db.query(AttributeOption).filter(AttributeOption.id == option_id).first()
    if option is None:
        raise HTTPException(status_code=404, detail=f"Unknown option id {option_id}")
    db.delete(option)
    db.commit()


@router.patch("/extras/{extra_id}", response_model=ExtraChargeOut)
def update_extra_charge(
    extra_id: int, payload: ExtraChargeUpdate, db: Session = Depends(get_db),
    user=Depends(require_role(UserRole.ADMIN)),
):
    extra = db.query(ExtraCharge).filter(ExtraCharge.id == extra_id).first()
    if extra is None:
        raise HTTPException(status_code=404, detail=f"Unknown extra charge id {extra_id}")
    if payload.amount is not None:
        extra.amount = payload.amount
    if payload.minimum_amount is not None:
        extra.minimum_amount = payload.minimum_amount
    db.commit()
    db.refresh(extra)
    return extra


@router.post("/categories/{category_code}/skus", response_model=SKUProductOut, status_code=201)
def add_sku(
    category_code: str, payload: SKUProductIn, db: Session = Depends(get_db),
    user=Depends(require_role(UserRole.ADMIN)),
):
    category = _get_category_or_404(category_code, db)
    existing = db.query(SKUProduct).filter(
        SKUProduct.category_id == category.id, SKUProduct.sku_code == payload.sku_code,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"SKU '{payload.sku_code}' already exists")
    sku = SKUProduct(category_id=category.id, **payload.model_dump())
    db.add(sku)
    db.commit()
    db.refresh(sku)
    return sku


@router.patch("/skus/{sku_id}", response_model=SKUProductOut)
def update_sku(
    sku_id: int, payload: SKUProductUpdate, db: Session = Depends(get_db),
    user=Depends(require_role(UserRole.ADMIN)),
):
    sku = db.query(SKUProduct).filter(SKUProduct.id == sku_id).first()
    if sku is None:
        raise HTTPException(status_code=404, detail=f"Unknown SKU id {sku_id}")
    if payload.name is not None:
        sku.name = payload.name
    if payload.price is not None:
        sku.price = payload.price
    db.commit()
    db.refresh(sku)
    return sku


@router.delete("/skus/{sku_id}", status_code=204)
def remove_sku(
    sku_id: int, db: Session = Depends(get_db),
    user=Depends(require_role(UserRole.ADMIN)),
):
    sku = db.query(SKUProduct).filter(SKUProduct.id == sku_id).first()
    if sku is None:
        raise HTTPException(status_code=404, detail=f"Unknown SKU id {sku_id}")
    db.delete(sku)
    db.commit()
