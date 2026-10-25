import math
from dataclasses import dataclass, field
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional, Tuple

from app.models.masters import Tax
from app.models.company import HsnCode
from app.models.product import Product, ProductCategory, ProductPricingType
from app.models.attribute import Attribute, AttributeOption
from app.models.price_matrix import PriceMatrixCell, PriceMatrixCellOption
from app.models.quantity_slab import QuantitySlab
from app.models.extra_charge import ExtraCharge, ChargeType

COPIES_ATTRIBUTE = "Copies per Set"
GSM_ATTRIBUTE = "Paper/GSM Type"


def find_price_matrix_cell(
    db: Session,
    product_id: int,
    quantity: int,
    selected_options: List[Tuple[int, int]],
) -> Optional[PriceMatrixCell]:
    candidates = (
        db.query(PriceMatrixCell)
        .join(QuantitySlab, PriceMatrixCell.quantity_slab_id == QuantitySlab.id)
        .filter(
            PriceMatrixCell.product_id == product_id,
            PriceMatrixCell.is_active.is_(True),
            QuantitySlab.min_quantity <= quantity,
            (QuantitySlab.max_quantity.is_(None)) | (QuantitySlab.max_quantity >= quantity),
        )
        .all()
    )

    selected_set = set(selected_options)
    for cell in candidates:
        cell_set = {(o.attribute_id, o.attribute_option_id) for o in cell.options}
        if cell_set == selected_set:
            return cell
    return None



def _incremental_base_unit(
    db: Session,
    product: Product,
    quantity: int,
    matrix_options: List[Tuple[int, int]],
    matched_cell: PriceMatrixCell,
) -> float:
    """Average unit price when the matched band is 'incremental'.

    "1st 1000 Nos" / "Add. 1000 Nos" style rate sheets price each band only for
    the units that fall inside it: 2,500 units = 1,000 at the first rate +
    1,500 at the additional rate. Non-incremental bands keep the old behaviour
    (the matched band's rate applies to the whole quantity)."""
    matched_slab = db.query(QuantitySlab).filter(QuantitySlab.id == matched_cell.quantity_slab_id).first()
    if not matched_slab or not matched_slab.is_incremental:
        return matched_cell.unit_price

    slabs = (
        db.query(QuantitySlab)
        .filter(
            QuantitySlab.category_id == matched_slab.category_id,
            QuantitySlab.is_incremental.is_(True),
            QuantitySlab.min_quantity <= quantity,
        )
        .order_by(QuantitySlab.min_quantity)
        .all()
    )
    total = 0.0
    for slab in slabs:
        upper = quantity if slab.max_quantity is None else min(quantity, slab.max_quantity)
        units = upper - slab.min_quantity + 1
        if units <= 0:
            continue
        cell = matched_cell if slab.id == matched_slab.id else find_price_matrix_cell(db, product.id, slab.min_quantity, matrix_options)
        if not cell:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"No price matrix entry for the '{slab.label or slab.min_quantity}' band of this combination",
            )
        total += units * cell.unit_price
    return total / quantity


def _never_cheaper_for_more(
    db: Session,
    product: Product,
    quantity: int,
    matrix_options: List[Tuple[int, int]],
    matched_cell: PriceMatrixCell,
    base_unit: float,
) -> float:
    """A bigger order must never cost less than a smaller one.

    With "whole quantity at the band's rate" bands, 100 pieces at the 100+ rate can come out below 99 pieces
    at the lower band's rate. When the matched band directly follows another band, the total is held at no
    less than the previous band's top quantity at that band's rate."""
    slab = db.query(QuantitySlab).filter(QuantitySlab.id == matched_cell.quantity_slab_id).first()
    if not slab or slab.is_incremental:
        return base_unit
    previous_slabs = (
        db.query(QuantitySlab)
        .filter(
            QuantitySlab.category_id == slab.category_id,
            QuantitySlab.is_incremental.is_(False),
            QuantitySlab.max_quantity == slab.min_quantity - 1,
        )
        .order_by(QuantitySlab.id)
        .all()
    )
    # Bands of different kinds can overlap inside one service (e.g. printing vs scanning), so use the
    # neighbouring band that actually has a rate for this product and option combination.
    previous, prev_cell = None, None
    for candidate in previous_slabs:
        prev_cell = find_price_matrix_cell(db, product.id, candidate.max_quantity, matrix_options)
        if prev_cell and prev_cell.quantity_slab_id == candidate.id:
            previous = candidate
            break
    if previous is None or prev_cell is None:
        return base_unit
    floor_total = prev_cell.unit_price * previous.max_quantity
    if base_unit * quantity < floor_total:
        return floor_total / quantity
    return base_unit


def _validate_extra_charges(charges: List[ExtraCharge], selected_option_ids: set) -> None:
    """Keeps grouped charges single-choice and dependent charges consistent, so a
    wrong combination can never silently produce a wrong price."""
    seen_groups = {}
    for charge in charges:
        if charge.group_name:
            if charge.group_name in seen_groups:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Only one '{charge.group_name}' can be chosen "
                           f"('{seen_groups[charge.group_name]}' and '{charge.name}' were both selected)",
                )
            seen_groups[charge.group_name] = charge.name
        if charge.requires_option_id and charge.requires_option_id not in selected_option_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"'{charge.name}' does not apply to the selected options",
            )


@dataclass
class LinePrice:
    unit_price: float
    total: float
    paper_total: float
    print_charge: float
    charges: List[Tuple[int, float]] = field(default_factory=list)
    layers: int = 1
    hsn_code: Optional[str] = None
    tax_rate: float = 0.0


def layer_count(db: Session, selected_options: List[Tuple[int, int]]) -> int:
    """Number of paper layers in one set, from the 'Copies per Set' choice ("1" -> 1, "1+3" -> 4)."""
    if not selected_options:
        return 1
    option_ids = [o for _, o in selected_options]
    row = (
        db.query(AttributeOption.value)
        .join(Attribute, Attribute.id == AttributeOption.attribute_id)
        .filter(Attribute.name == COPIES_ATTRIBUTE, AttributeOption.id.in_(option_ids))
        .first()
    )
    if not row:
        return 1
    parts = str(row[0]).split("+")
    try:
        return 1 + sum(int(p) for p in parts[1:] if p.strip())
    except ValueError:
        return 1


def line_tax(db: Session, product: Product, tax_id: Optional[int] = None) -> Tuple[Optional[str], float]:
    """(HSN code, GST %) for a product: its own HSN, else its service's, else the default tax rate."""
    hsn = None
    if product.hsn_id:
        hsn = db.query(HsnCode).filter(HsnCode.id == product.hsn_id).first()
    if hsn is None and product.category_id:
        category = db.query(ProductCategory).filter(ProductCategory.id == product.category_id).first()
        if category and category.hsn_id:
            hsn = db.query(HsnCode).filter(HsnCode.id == category.hsn_id).first()
    if hsn is not None and hsn.is_active:
        return hsn.code, float(hsn.gst_rate)
    return None, float(resolve_tax(db, tax_id).rate_percent)


def printing_charge(category: Optional[ProductCategory], quantity: int, layers: int) -> float:
    """Printing charge on top of the paper: a rate per block of copies (minimum one block) or per copy."""
    if not category or not category.print_charge_mode or quantity <= 0:
        return 0.0
    if category.print_charge_mode == "block" and category.print_block_size and category.print_block_rate:
        amount = max(1, math.ceil(quantity / category.print_block_size)) * category.print_block_rate
    elif category.print_charge_mode == "per_copy" and category.print_per_copy_rate:
        amount = category.print_per_copy_rate * quantity
    else:
        return 0.0
    return amount * (layers if category.print_per_layer else 1)


def price_line(
    db: Session,
    product: Product,
    quantity: int,
    selected_options: List[Tuple[int, int]],
    area_sqft: Optional[float],
    extra_charge_ids: List[int],
    sets: int = 1,
    layer_gsm_option_ids: Optional[List[int]] = None,
    tax_id: Optional[int] = None,
) -> LinePrice:
    """Prices one order line: paper (per layer) + extra charges + printing charge, with the service minimum applied."""
    category = db.query(ProductCategory).filter(ProductCategory.id == product.category_id).first() if product.category_id else None
    layers = layer_count(db, selected_options)

    if product.pricing_type == ProductPricingType.fixed:
        if product.fixed_price is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Product has no fixed price configured")
        base_unit = product.fixed_price
    else:
        # Only attributes flagged in_price_matrix form the price-cell key; the rest
        # (document type, paper brand, copies...) are descriptive or surcharge-only.
        matrix_attr_ids = {
            a.id for a in db.query(Attribute.id).filter(
                Attribute.id.in_([attr_id for attr_id, _ in selected_options]),
                Attribute.in_price_matrix.is_(True),
            )
        } if selected_options else set()
        matrix_options = [(a, o) for a, o in selected_options if a in matrix_attr_ids]
        cell = find_price_matrix_cell(db, product.id, quantity, matrix_options)
        if not cell:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No price matrix entry for this product/attribute combination/quantity",
            )
        if product.pricing_type == ProductPricingType.per_area:
            base_unit = cell.unit_price * (area_sqft or 0)
        else:
            gsm_attr = None
            if layers > 1 and category is not None:
                gsm_attr = db.query(Attribute).filter(Attribute.category_id == category.id, Attribute.name == GSM_ATTRIBUTE).first()
            gsm_in_key = next(((a, o) for a, o in matrix_options if gsm_attr and a == gsm_attr.id), None)

            def paper_unit(options: List[Tuple[int, int]], matched: PriceMatrixCell) -> float:
                unit = _incremental_base_unit(db, product, quantity, options, matched)
                return _never_cheaper_for_more(db, product, quantity, options, matched, unit)

            base_unit = paper_unit(matrix_options, cell)
            layer_options: List[Tuple[int, int]] = []
            if gsm_in_key:
                # Each further copy of the set is its own paper, in the GSM chosen for that copy (default: the top copy's).
                wanted = list(layer_gsm_option_ids or [])
                for i in range(layers - 1):
                    layer_option = wanted[i] if i < len(wanted) and wanted[i] else gsm_in_key[1]
                    layer_options.append((gsm_in_key[0], layer_option))
                    if layer_option == gsm_in_key[1]:
                        base_unit += paper_unit(matrix_options, cell)
                        continue
                    options = [(a, layer_option) if a == gsm_in_key[0] else (a, o) for a, o in matrix_options]
                    layer_cell = find_price_matrix_cell(db, product.id, quantity, options)
                    if not layer_cell:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail="No price entered for the GSM chosen for one of the copies at this quantity",
                        )
                    base_unit += paper_unit(options, layer_cell)
            if selected_options:
                option_ids = [opt_id for _, opt_id in selected_options]
                options = db.query(AttributeOption).filter(AttributeOption.id.in_(option_ids)).all()
                base_unit += sum(o.extra_price for o in options)
                if layer_options:
                    extras = {o.id: o.extra_price for o in db.query(AttributeOption).filter(AttributeOption.id.in_([o for _, o in layer_options])).all()}
                    base_unit += sum(extras.get(o, 0.0) for _, o in layer_options)

    paper_total = base_unit * quantity
    charges_total = 0.0
    computed_charges: List[Tuple[int, float]] = []
    if extra_charge_ids:
        charges = db.query(ExtraCharge).filter(ExtraCharge.id.in_(extra_charge_ids)).all()
        unavailable = [c.name for c in charges if not c.is_active]
        if unavailable or len(charges) != len(set(extra_charge_ids)):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Extra charge no longer available: {', '.join(unavailable) or 'unknown charge'}",
            )
        _validate_extra_charges(charges, {opt_id for _, opt_id in selected_options})
        for charge in charges:
            if charge.charge_type == ChargeType.per_unit:
                total_amount = charge.amount * quantity
            elif charge.charge_type == ChargeType.per_sqft:
                total_amount = charge.amount * (area_sqft or 0) * quantity
            elif charge.charge_type == ChargeType.per_set:
                total_amount = charge.amount * max(sets, 1)
            elif charge.charge_type == ChargeType.flat:
                total_amount = charge.amount
            elif charge.charge_type == ChargeType.percentage:
                total_amount = base_unit * quantity * (charge.amount / 100)
            else:
                total_amount = 0.0
            charges_total += total_amount
            computed_charges.append((charge.id, total_amount))

    print_amount = printing_charge(category, quantity, layers)
    total = paper_total + charges_total + print_amount

    # Minimum charge per line for this service: tiny runs cost more per unit.
    if category and category.min_charge and quantity > 0 and total < category.min_charge:
        total = category.min_charge

    hsn_code, tax_rate = line_tax(db, product, tax_id)
    return LinePrice(
        unit_price=total / quantity if quantity else 0.0,
        total=total,
        paper_total=paper_total,
        print_charge=print_amount,
        charges=computed_charges,
        layers=layers,
        hsn_code=hsn_code,
        tax_rate=tax_rate,
    )


def calculate_unit_price(
    db: Session,
    product: Product,
    quantity: int,
    selected_options: List[Tuple[int, int]],
    area_sqft: Optional[float],
    extra_charge_ids: List[int],
    sets: int = 1,
    layer_gsm_option_ids: Optional[List[int]] = None,
) -> Tuple[float, List[Tuple[int, float]]]:
    """Returns (unit_price, [(extra_charge_id, total_amount_charged), ...])."""
    line = price_line(db, product, quantity, selected_options, area_sqft, extra_charge_ids, sets, layer_gsm_option_ids)
    return line.unit_price, line.charges


def resolve_tax(db: Session, tax_id: Optional[int]) -> Tax:
    if tax_id is not None:
        tax = db.query(Tax).filter(Tax.id == tax_id).first()
        if not tax:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tax not found")
        return tax

    tax = db.query(Tax).filter(Tax.is_default.is_(True)).first()
    if not tax:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No default tax configured")
    return tax
