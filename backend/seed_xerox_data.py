"""
Seeds a full Xerox / Photocopy billing catalog using the generic pricing engine
(ProductCategory / Attribute / AttributeOption / QuantitySlab / ExtraCharge / Product /
PriceMatrixCell) — no backend code changes needed, this is pure catalog data.

Safe to re-run: every entity is fetched-or-created by name, so running this twice
won't create duplicates.

Usage:
    cd backend && venv\\Scripts\\activate && python seed_xerox_data.py
"""

from app.core.database import SessionLocal
from app.models.product import ProductCategory, Product, ProductPricingType
from app.models.attribute import Attribute, AttributeOption
from app.models.quantity_slab import QuantitySlab
from app.models.extra_charge import ExtraCharge, ChargeType
from app.models.price_matrix import PriceMatrixCell, PriceMatrixCellOption

db = SessionLocal()


def get_or_create(model, defaults=None, **filters):
    instance = db.query(model).filter_by(**filters).first()
    if instance:
        return instance, False
    params = {**filters, **(defaults or {})}
    instance = model(**params)
    db.add(instance)
    db.flush()
    return instance, True


def get_or_create_option(attribute_id, value, extra_price=0.0, display_order=0):
    option = db.query(AttributeOption).filter_by(attribute_id=attribute_id, value=value).first()
    if option:
        return option, False
    option = AttributeOption(attribute_id=attribute_id, value=value, extra_price=extra_price, display_order=display_order)
    db.add(option)
    db.flush()
    return option, True


def get_or_create_slab(category_id, min_quantity, max_quantity, label, display_order):
    slab = db.query(QuantitySlab).filter_by(category_id=category_id, min_quantity=min_quantity, max_quantity=max_quantity).first()
    if slab:
        return slab, False
    slab = QuantitySlab(category_id=category_id, min_quantity=min_quantity, max_quantity=max_quantity, label=label, display_order=display_order)
    db.add(slab)
    db.flush()
    return slab, True


def get_or_create_cell(product_id, quantity_slab_id, option_pairs, unit_price):
    """option_pairs: list of (attribute_id, attribute_option_id) tuples defining the exact match key."""
    candidates = db.query(PriceMatrixCell).filter_by(product_id=product_id, quantity_slab_id=quantity_slab_id).all()
    wanted = set(option_pairs)
    for cell in candidates:
        existing = {(o.attribute_id, o.attribute_option_id) for o in cell.options}
        if existing == wanted:
            cell.unit_price = unit_price
            db.flush()
            return cell, False
    cell = PriceMatrixCell(product_id=product_id, quantity_slab_id=quantity_slab_id, unit_price=unit_price, is_active=True)
    db.add(cell)
    db.flush()
    for attribute_id, option_id in option_pairs:
        db.add(PriceMatrixCellOption(price_matrix_cell_id=cell.id, attribute_id=attribute_id, attribute_option_id=option_id))
    db.flush()
    return cell, True


def main():
    created_counts = {"categories": 0, "attributes": 0, "options": 0, "slabs": 0, "extra_charges": 0, "products": 0, "cells": 0}

    # --- Category ---
    category, created = get_or_create(ProductCategory, name="Xerox / Photocopy", defaults={"is_active": True})
    created_counts["categories"] += int(created)

    # --- Attributes + Options ---
    size_attr, created = get_or_create(Attribute, category_id=category.id, name="Paper Size", defaults={"is_required": True, "display_order": 1})
    created_counts["attributes"] += int(created)
    size_options = {}
    for i, value in enumerate(["A4", "A3", "A5", "Legal / FS"]):
        opt, created = get_or_create_option(size_attr.id, value, display_order=i)
        size_options[value] = opt
        created_counts["options"] += int(created)

    colour_attr, created = get_or_create(Attribute, category_id=category.id, name="Colour", defaults={"is_required": True, "display_order": 2})
    created_counts["attributes"] += int(created)
    colour_options = {}
    for i, value in enumerate(["Black & White", "Colour"]):
        opt, created = get_or_create_option(colour_attr.id, value, display_order=i)
        colour_options[value] = opt
        created_counts["options"] += int(created)

    side_attr, created = get_or_create(Attribute, category_id=category.id, name="Print Side", defaults={"is_required": True, "display_order": 3})
    created_counts["attributes"] += int(created)
    side_options = {}
    for i, value in enumerate(["Single Side", "Double Side"]):
        opt, created = get_or_create_option(side_attr.id, value, display_order=i)
        side_options[value] = opt
        created_counts["options"] += int(created)

    paper_quality_attr, created = get_or_create(Attribute, category_id=category.id, name="Paper Quality", defaults={"is_required": False, "display_order": 4})
    created_counts["attributes"] += int(created)
    quality_options = {}
    for i, value in enumerate(["Normal (70 GSM)", "Bond Paper", "Photo Glossy"]):
        opt, created = get_or_create_option(paper_quality_attr.id, value, display_order=i)
        quality_options[value] = opt
        created_counts["options"] += int(created)

    # --- Quantity Slabs (page-count bands) ---
    slab_defs = [
        (1, 50, "1 - 50 pages", 1),
        (51, 100, "51 - 100 pages", 2),
        (101, 500, "101 - 500 pages", 3),
        (501, 1000, "501 - 1000 pages", 4),
        (1001, None, "1000+ pages", 5),
    ]
    slabs = []
    for min_q, max_q, label, order in slab_defs:
        slab, created = get_or_create_slab(category.id, min_q, max_q, label, order)
        slabs.append(slab)
        created_counts["slabs"] += int(created)

    # --- Extra Charges (opt-in finishing add-ons) ---
    extra_charge_defs = [
        ("Spiral Binding", ChargeType.flat, 30.0),
        ("Soft Binding", ChargeType.flat, 50.0),
        ("Hard Binding", ChargeType.flat, 150.0),
        ("Stapling", ChargeType.flat, 2.0),
        ("Lamination (per page)", ChargeType.per_unit, 5.0),
    ]
    for name, charge_type, amount in extra_charge_defs:
        _, created = get_or_create(
            ExtraCharge, category_id=category.id, name=name,
            defaults={"charge_type": charge_type, "amount": amount, "is_active": True},
        )
        created_counts["extra_charges"] += int(created)

    # --- Products ---
    xerox_product, created = get_or_create(
        Product, name="Xerox / Photocopy", category_id=category.id,
        defaults={"pricing_type": ProductPricingType.matrix, "is_active": True},
    )
    created_counts["products"] += int(created)

    passport_product, created = get_or_create(
        Product, name="Passport Size Photo Copy", category_id=category.id,
        defaults={"pricing_type": ProductPricingType.fixed, "fixed_price": 20.0, "is_active": True},
    )
    created_counts["products"] += int(created)

    # --- Price Matrix Cells ---
    # Slab index shorthand: 0=1-50, 1=51-100, 2=101-500, 3=501-1000, 4=1001+
    def cell(size, colour, side, slab_index, price):
        options = [
            (size_attr.id, size_options[size].id),
            (colour_attr.id, colour_options[colour].id),
            (side_attr.id, side_options[side].id),
        ]
        _, created = get_or_create_cell(xerox_product.id, slabs[slab_index].id, options, price)
        created_counts["cells"] += int(created)

    # A4 — the bulk of real-world volume — full slab coverage, both colours, both sides
    for slab_i, bw_single, bw_double, col_single, col_double in [
        (0, 2.0, 3.0, 10.0, 18.0),
        (1, 1.5, 2.5, 9.0, 16.0),
        (2, 1.2, 2.0, 8.0, 14.0),
        (3, 1.0, 1.8, 7.0, 12.0),
        (4, 0.8, 1.5, 6.0, 10.0),
    ]:
        cell("A4", "Black & White", "Single Side", slab_i, bw_single)
        cell("A4", "Black & White", "Double Side", slab_i, bw_double)
        cell("A4", "Colour", "Single Side", slab_i, col_single)
        cell("A4", "Colour", "Double Side", slab_i, col_double)

    # A3 — less common, representative small/medium/bulk tiers
    for slab_i, bw_single, col_single in [(0, 4.0, 20.0), (1, 3.5, 18.0), (2, 3.0, 15.0)]:
        cell("A3", "Black & White", "Single Side", slab_i, bw_single)
        cell("A3", "Colour", "Single Side", slab_i, col_single)

    # A5 — smaller than A4, cheaper
    for slab_i, bw_single in [(0, 1.5), (1, 1.2), (2, 1.0)]:
        cell("A5", "Black & White", "Single Side", slab_i, bw_single)

    # Legal / FS — similar to A4 but slightly higher
    for slab_i, bw_single, bw_double in [(0, 2.5, 3.5), (1, 2.0, 3.0), (2, 1.5, 2.5)]:
        cell("Legal / FS", "Black & White", "Single Side", slab_i, bw_single)
        cell("Legal / FS", "Black & White", "Double Side", slab_i, bw_double)

    db.commit()

    print("Xerox / Photocopy catalog seeded successfully.")
    for key, count in created_counts.items():
        print(f"  {key}: {count} newly created")


if __name__ == "__main__":
    main()
