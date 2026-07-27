"""
The pricing resolver described in Section 6 of the blueprint doc:

    base = PriceMatrixCell(category, selected attributes, quantity slab)
    total = base * qty + sum(selected ExtraCharge) [+ per-unit attribute cost deltas]

This same function is meant to back Quotation, Estimate, Job Card, and the
final Tax Invoice, so a job is priced exactly once and carried through every
document stage unchanged.
"""
import math
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models import (
    ProductCategory, PricingMode, QuantitySlab, PriceMatrixCell,
    ExtraCharge, ChargeType, SKUProduct, AttributeOption, Attribute,
)


class PricingError(ValueError):
    """Raised when a quote can't be resolved (unknown category, no matching slab/cell, etc.)."""


def _find_slab(db: Session, category_id: int, quantity: int) -> QuantitySlab:
    slabs = (
        db.query(QuantitySlab)
        .filter(QuantitySlab.category_id == category_id)
        .order_by(QuantitySlab.min_qty)
        .all()
    )
    if not slabs:
        raise PricingError("No quantity slabs configured for this category.")

    # Exact-range slabs first (e.g. 1-500, 501-1000)
    for slab in slabs:
        if not slab.is_additional_block and slab.max_qty is not None:
            if slab.min_qty <= quantity <= slab.max_qty:
                return slab

    # Otherwise fall back to the "additional block" slab (e.g. "Additional per 1000")
    for slab in slabs:
        if slab.is_additional_block and quantity >= slab.min_qty:
            return slab

    raise PricingError(f"Quantity {quantity} does not fall inside any configured slab.")


def _selector_matches(selector: dict, selected_options: dict) -> bool:
    """A PriceMatrixCell matches if every key in its selector is present and equal
    in the customer's selected options (subset containment, not exact equality —
    so a cell can be keyed only on the attributes that actually affect price)."""
    return all(selected_options.get(k) == v for k, v in selector.items())


def _find_matrix_cell(db: Session, category_id: int, slab_id: int, selected_options: dict) -> PriceMatrixCell:
    candidates = (
        db.query(PriceMatrixCell)
        .filter(PriceMatrixCell.category_id == category_id, PriceMatrixCell.slab_id == slab_id)
        .all()
    )
    matches = [c for c in candidates if _selector_matches(c.attribute_selector, selected_options)]
    if not matches:
        raise PricingError(
            "No price-matrix cell matches the selected attributes/quantity slab. "
            "Check that the rate-card data entry covers this combination."
        )
    # Prefer the most specific match (most attribute keys pinned down)
    matches.sort(key=lambda c: len(c.attribute_selector), reverse=True)
    return matches[0]


def _attribute_cost_deltas(db: Session, category_id: int, selected_options: dict) -> Decimal:
    total = Decimal("0")
    attrs = db.query(Attribute).filter(Attribute.category_id == category_id).all()
    for attr in attrs:
        chosen_value = selected_options.get(attr.code)
        if chosen_value is None:
            continue
        option = (
            db.query(AttributeOption)
            .filter(AttributeOption.attribute_id == attr.id, AttributeOption.value == chosen_value)
            .first()
        )
        if option:
            total += Decimal(option.cost_delta_per_unit)
    return total


def _extra_charge_amount(charge: ExtraCharge, quantity: int) -> Decimal:
    amount = Decimal(charge.amount)
    if charge.charge_type == ChargeType.FLAT:
        computed = amount
    elif charge.charge_type == ChargeType.PER_UNIT:
        computed = amount * quantity
    elif charge.charge_type == ChargeType.PER_1000:
        blocks = math.ceil(quantity / 1000)
        computed = amount * blocks
    else:  # pragma: no cover - defensive
        raise PricingError(f"Unknown charge type {charge.charge_type}")

    if charge.minimum_amount is not None:
        computed = max(computed, Decimal(charge.minimum_amount))
    return computed


def calculate_quote(
    db: Session,
    category_code: str,
    quantity: int,
    selected_options: dict[str, str] | None = None,
    extra_codes: list[str] | None = None,
):
    """Returns a dict shaped like schemas.QuoteResponse (minus category echo)."""
    selected_options = selected_options or {}
    extra_codes = extra_codes or []

    category = db.query(ProductCategory).filter(ProductCategory.code == category_code).first()
    if category is None:
        raise PricingError(f"Unknown product category '{category_code}'.")

    if quantity <= 0:
        raise PricingError("Quantity must be a positive integer.")

    if category.pricing_mode == PricingMode.SKU:
        sku_code = selected_options.get("SKU")
        if not sku_code:
            raise PricingError("SKU-priced categories require selected_options.SKU to be set.")
        sku = (
            db.query(SKUProduct)
            .filter(SKUProduct.category_id == category.id, SKUProduct.sku_code == sku_code)
            .first()
        )
        if sku is None:
            raise PricingError(f"Unknown SKU '{sku_code}' for category '{category_code}'.")
        base_rate = Decimal(sku.price)
        subtotal = base_rate * quantity
        slab_label = "flat SKU price"
    else:
        slab = _find_slab(db, category.id, quantity)
        cell = _find_matrix_cell(db, category.id, slab.id, selected_options)
        base_rate = Decimal(cell.base_rate) + _attribute_cost_deltas(db, category.id, selected_options)
        subtotal = base_rate * quantity
        slab_label = slab.label

    extras_breakdown = []
    extras_total = Decimal("0")
    all_extras = {e.code: e for e in db.query(ExtraCharge).filter(ExtraCharge.category_id == category.id).all()}
    for code in extra_codes:
        charge = all_extras.get(code)
        if charge is None:
            raise PricingError(f"Unknown extra charge '{code}' for category '{category_code}'.")
        amount = _extra_charge_amount(charge, quantity)
        extras_breakdown.append({"code": charge.code, "name": charge.name, "amount": amount})
        extras_total += amount

    total = subtotal + extras_total

    return {
        "category_code": category_code,
        "quantity": quantity,
        "slab_label": slab_label,
        "base_rate_per_unit": base_rate,
        "subtotal": subtotal,
        "extras": extras_breakdown,
        "extras_total": extras_total,
        "total": total,
    }
