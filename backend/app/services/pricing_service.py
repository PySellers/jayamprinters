from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional, Tuple

from app.models.masters import Tax
from app.models.product import Product, ProductPricingType
from app.models.attribute import Attribute, AttributeOption
from app.models.price_matrix import PriceMatrixCell, PriceMatrixCellOption
from app.models.quantity_slab import QuantitySlab
from app.models.extra_charge import ExtraCharge, ChargeType


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


def calculate_unit_price(
    db: Session,
    product: Product,
    quantity: int,
    selected_options: List[Tuple[int, int]],
    area_sqft: Optional[float],
    extra_charge_ids: List[int],
) -> Tuple[float, List[Tuple[int, float]]]:
    """Returns (unit_price, [(extra_charge_id, total_amount_charged), ...])."""

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
            base_unit = cell.unit_price
            if selected_options:
                option_ids = [opt_id for _, opt_id in selected_options]
                options = db.query(AttributeOption).filter(AttributeOption.id.in_(option_ids)).all()
                base_unit += sum(o.extra_price for o in options)

    extra_per_unit = 0.0
    computed_charges: List[Tuple[int, float]] = []
    if extra_charge_ids:
        charges = db.query(ExtraCharge).filter(ExtraCharge.id.in_(extra_charge_ids)).all()
        _validate_extra_charges(charges, {opt_id for _, opt_id in selected_options})
        for charge in charges:
            if charge.charge_type == ChargeType.per_unit:
                total_amount = charge.amount * quantity
            elif charge.charge_type == ChargeType.per_sqft:
                total_amount = charge.amount * (area_sqft or 0) * quantity
            elif charge.charge_type == ChargeType.flat:
                total_amount = charge.amount
            elif charge.charge_type == ChargeType.percentage:
                total_amount = base_unit * quantity * (charge.amount / 100)
            else:
                total_amount = 0.0
            extra_per_unit += total_amount / quantity
            computed_charges.append((charge.id, total_amount))

    return base_unit + extra_per_unit, computed_charges


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
