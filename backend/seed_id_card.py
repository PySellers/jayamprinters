"""
Seeds the "ID Card" catalog structure from the client PDF (page 19).

This page shows no detailed quantity/GSM rate grid (unlike most other
categories) -- just a generic Qty box and a Side toggle, so a single
catch-all "Per Unit" quantity slab is used, crossed with Side. Holder,
Rope, Hook Model, and PVC Pouch are independent ExtraCharges. Holder/rope
color choices belong on the quotation item's spec_notes field.

All prices seeded at Rs.0 (placeholder) -- fill in real rates via Pricing
Setup / Price Matrix.

Safe to re-run.

Usage:
    cd backend && venv\\Scripts\\activate && python seed_id_card.py
"""

from app.core.database import SessionLocal
from app.models.product import ProductCategory, Product, ProductPricingType
from app.models.attribute import Attribute
from app.models.extra_charge import ExtraCharge, ChargeType
from app.utils.seed_helpers import get_or_create, get_or_create_option, get_or_create_slab, get_or_create_cell

db = SessionLocal()

SIDE_OPTIONS = ["Single Side", "Front & Back"]
PRODUCT_NAMES = ["Synthetic ID Card", "PVC ID Card", "Chip Card", "Temporary ID Card"]


def main():
    created_counts = {"categories": 0, "attributes": 0, "options": 0, "slabs": 0, "extra_charges": 0, "products": 0, "cells": 0}

    category, created = get_or_create(db, ProductCategory, name="ID Card", defaults={"is_active": True})
    created_counts["categories"] += int(created)

    side_attr, created = get_or_create(db, Attribute, category_id=category.id, name="Side", defaults={"is_required": True, "display_order": 1})
    created_counts["attributes"] += int(created)
    side_options = {}
    for i, value in enumerate(SIDE_OPTIONS):
        opt, created = get_or_create_option(db, side_attr.id, value, display_order=i)
        side_options[value] = opt
        created_counts["options"] += int(created)

    slab, created = get_or_create_slab(db, category.id, 1, None, "Per Unit", 1)
    created_counts["slabs"] += int(created)

    extra_charge_defs = [
        ("Holder - Portrait", ChargeType.flat, 0.0),
        ("Holder - Landscape", ChargeType.flat, 0.0),
        ("Holder Quality - First Quality", ChargeType.flat, 0.0),
        ("Holder Quality - 2nd Quality", ChargeType.flat, 0.0),
        ("Rope - Single Color", ChargeType.flat, 0.0),
        ("Rope - Multi Color", ChargeType.flat, 0.0),
        ("Hook Model", ChargeType.flat, 0.0),
        ("PVC Pouch - Portrait", ChargeType.flat, 0.0),
        ("PVC Pouch - Landscape", ChargeType.flat, 0.0),
        ("ID Sticker Only", ChargeType.flat, 0.0),
    ]
    for name, charge_type, amount in extra_charge_defs:
        _, created = get_or_create(db, ExtraCharge, category_id=category.id, name=name, defaults={"charge_type": charge_type, "amount": amount, "is_active": True})
        created_counts["extra_charges"] += int(created)

    for product_name in PRODUCT_NAMES:
        product, created = get_or_create(db, Product, name=product_name, category_id=category.id, defaults={"pricing_type": ProductPricingType.matrix, "is_active": True})
        created_counts["products"] += int(created)
        for side_value in SIDE_OPTIONS:
            options = [(side_attr.id, side_options[side_value].id)]
            _, created = get_or_create_cell(db, product.id, slab.id, options, 0.0)
            created_counts["cells"] += int(created)

    db.commit()

    print("ID Card catalog seeded successfully.")
    for key, count in created_counts.items():
        print(f"  {key}: {count} newly created")


if __name__ == "__main__":
    main()
