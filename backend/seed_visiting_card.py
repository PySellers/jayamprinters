"""
Seeds the "Visiting Card" catalog structure from the client PDF (page 18).

This is the largest matrix in the catalog: 23 quantity brackets (50 to
40000, seeded as discrete slabs matching the PDF's literal row list) x 5
finish/lamination types x 2 sides = 230 price cells for the one product.
Use the bulk price-entry grid on the Price Matrix page to fill these in
rather than the one-at-a-time dialog.

The PDF's "Criss Cross, Gold Metalic, White Nurling, Puff Nurling, Silver
Metalic, Special Board" column shares a single price column for all of
those finishes, so it's modeled as one combined option rather than 6.

All prices seeded at Rs.0 (placeholder) -- fill in real rates via Pricing
Setup / Price Matrix.

Safe to re-run.

Usage:
    cd backend && venv\\Scripts\\activate && python seed_visiting_card.py
"""

from app.core.database import SessionLocal
from app.models.product import ProductCategory, Product, ProductPricingType
from app.models.attribute import Attribute
from app.models.extra_charge import ExtraCharge, ChargeType
from app.utils.seed_helpers import get_or_create, get_or_create_option, get_or_create_slab, get_or_create_cell

db = SessionLocal()

QUANTITIES = [50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 1000, 1500, 2000, 2500,
              3000, 3500, 4000, 4500, 5000, 10000, 20000, 30000, 40000]
FINISH_OPTIONS = [
    "Without Lamination", "Gloss Lamination", "Matt Lamination", "3D Lamination/Ivory",
    "Special Finish (Criss Cross/Gold Metallic/White Nurling/Puff Nurling/Silver Metallic/Special Board)",
]
SIDE_OPTIONS = ["Single Side", "Front & Back"]


def main():
    created_counts = {"categories": 0, "attributes": 0, "options": 0, "slabs": 0, "extra_charges": 0, "products": 0, "cells": 0}

    category, created = get_or_create(db, ProductCategory, name="Visiting Card", defaults={"is_active": True})
    created_counts["categories"] += int(created)

    finish_attr, created = get_or_create(db, Attribute, category_id=category.id, name="Finish/Lamination Type", defaults={"is_required": True, "display_order": 1})
    created_counts["attributes"] += int(created)
    finish_options = {}
    for i, value in enumerate(FINISH_OPTIONS):
        opt, created = get_or_create_option(db, finish_attr.id, value, display_order=i)
        finish_options[value] = opt
        created_counts["options"] += int(created)

    side_attr, created = get_or_create(db, Attribute, category_id=category.id, name="Side", defaults={"is_required": True, "display_order": 2})
    created_counts["attributes"] += int(created)
    side_options = {}
    for i, value in enumerate(SIDE_OPTIONS):
        opt, created = get_or_create_option(db, side_attr.id, value, display_order=i)
        side_options[value] = opt
        created_counts["options"] += int(created)

    slabs = []
    for i, qty in enumerate(QUANTITIES):
        slab, created = get_or_create_slab(db, category.id, qty, qty, str(qty), i)
        slabs.append(slab)
        created_counts["slabs"] += int(created)

    extra_charge_defs = [
        ("Designing Charge", ChargeType.flat, 0.0),
        ("Logo Designing Charge", ChargeType.flat, 0.0),
        ("Corner Cutting - Two Corner", ChargeType.flat, 0.0),
        ("Corner Cutting - Four Corner", ChargeType.flat, 0.0),
        ("Foiling - Gold", ChargeType.flat, 0.0),
        ("Foiling - Silver", ChargeType.flat, 0.0),
    ]
    for name, charge_type, amount in extra_charge_defs:
        _, created = get_or_create(db, ExtraCharge, category_id=category.id, name=name, defaults={"charge_type": charge_type, "amount": amount, "is_active": True})
        created_counts["extra_charges"] += int(created)

    product, created = get_or_create(db, Product, name="Visiting Card", category_id=category.id, defaults={"pricing_type": ProductPricingType.matrix, "is_active": True})
    created_counts["products"] += int(created)
    for finish_value in FINISH_OPTIONS:
        for side_value in SIDE_OPTIONS:
            for slab in slabs:
                options = [(finish_attr.id, finish_options[finish_value].id), (side_attr.id, side_options[side_value].id)]
                _, created = get_or_create_cell(db, product.id, slab.id, options, 0.0)
                created_counts["cells"] += int(created)

    db.commit()

    print("Visiting Card catalog seeded successfully.")
    for key, count in created_counts.items():
        print(f"  {key}: {count} newly created")


if __name__ == "__main__":
    main()
