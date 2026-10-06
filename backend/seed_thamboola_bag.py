"""
Seeds the "Thamboola Bag" catalog structure from the client PDF (page 23).

Unlike Readymade Cover, this page's "Size x Cover Charges" table has no
named sizes filled in (blank template rows), so Size is left as a
descriptive spec_notes field rather than a fixed attribute list. The owner
can add named "Cover Charge - <size>" ExtraCharge rows via Pricing Setup
once they decide which bag sizes they actually stock.

All prices seeded at Rs.0 (placeholder) -- fill in real rates via Pricing
Setup / Price Matrix.

Safe to re-run.

Usage:
    cd backend && venv\\Scripts\\activate && python seed_thamboola_bag.py
"""

from app.core.database import SessionLocal
from app.models.product import ProductCategory, Product, ProductPricingType
from app.models.attribute import Attribute
from app.models.extra_charge import ExtraCharge, ChargeType
from app.utils.seed_helpers import get_or_create, get_or_create_option, get_or_create_slab, get_or_create_cell

db = SessionLocal()

SIDE_OPTIONS = ["Single Side", "Both Side"]


def main():
    created_counts = {"categories": 0, "attributes": 0, "options": 0, "slabs": 0, "extra_charges": 0, "products": 0, "cells": 0}

    category, created = get_or_create(db, ProductCategory, name="Thamboola Bag", defaults={"is_active": True})
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
        ("Cover Charge", ChargeType.flat, 0.0),
        ("Printing Color", ChargeType.flat, 0.0),
    ]
    for name, charge_type, amount in extra_charge_defs:
        _, created = get_or_create(db, ExtraCharge, category_id=category.id, name=name, defaults={"charge_type": charge_type, "amount": amount, "is_active": True})
        created_counts["extra_charges"] += int(created)

    product, created = get_or_create(db, Product, name="Thamboola Bag", category_id=category.id, defaults={"pricing_type": ProductPricingType.matrix, "is_active": True})
    created_counts["products"] += int(created)
    for side_value in SIDE_OPTIONS:
        options = [(side_attr.id, side_options[side_value].id)]
        _, created = get_or_create_cell(db, product.id, slab.id, options, 0.0)
        created_counts["cells"] += int(created)

    db.commit()

    print("Thamboola Bag catalog seeded successfully.")
    for key, count in created_counts.items():
        print(f"  {key}: {count} newly created")


if __name__ == "__main__":
    main()
