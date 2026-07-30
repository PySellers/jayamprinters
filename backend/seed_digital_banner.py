"""
Seeds the "Digital Banner" catalog structure from the client PDF (page 24).

Uses Product.pricing_type = per_area (rate x sq.ft), matching the existing
engine support for per-area pricing. Media Type is the priced attribute
(rate per sq.ft varies by Flex/Sticker/Sunpack/Foam/Acrylic Sheet). Front/
Back Light, With Frame, With Fittings, and Transport Charge are independent
ExtraCharges. Sheet color belongs on spec_notes.

All rates seeded at Rs.0 (placeholder, meaning Rs.0 per sq.ft) -- fill in
real rates via Pricing Setup / Price Matrix.

Safe to re-run.

Usage:
    cd backend && venv\\Scripts\\activate && python seed_digital_banner.py
"""

from app.core.database import SessionLocal
from app.models.product import ProductCategory, Product, ProductPricingType
from app.models.attribute import Attribute
from app.models.extra_charge import ExtraCharge, ChargeType
from app.utils.seed_helpers import get_or_create, get_or_create_option, get_or_create_slab, get_or_create_cell

db = SessionLocal()

MEDIA_OPTIONS = [
    "Flex", "Star Flex", "Sticker", "Oneway Sticker", "Clear Sticker", "Eco Solvent Sticker",
    "Sunpack Sheet", "Foam Sheet", "Acrylic Sheet",
]


def main():
    created_counts = {"categories": 0, "attributes": 0, "options": 0, "slabs": 0, "extra_charges": 0, "products": 0, "cells": 0}

    category, created = get_or_create(db, ProductCategory, name="Digital Banner", defaults={"is_active": True})
    created_counts["categories"] += int(created)

    media_attr, created = get_or_create(db, Attribute, category_id=category.id, name="Media Type", defaults={"is_required": True, "display_order": 1})
    created_counts["attributes"] += int(created)
    media_options = {}
    for i, value in enumerate(MEDIA_OPTIONS):
        opt, created = get_or_create_option(db, media_attr.id, value, display_order=i)
        media_options[value] = opt
        created_counts["options"] += int(created)

    slab, created = get_or_create_slab(db, category.id, 1, None, "Per Banner", 1)
    created_counts["slabs"] += int(created)

    extra_charge_defs = [
        ("Front Light", ChargeType.flat, 0.0),
        ("Back Light", ChargeType.flat, 0.0),
        ("With Frame", ChargeType.flat, 0.0),
        ("With Fittings", ChargeType.flat, 0.0),
        ("Transport Charge", ChargeType.flat, 0.0),
    ]
    for name, charge_type, amount in extra_charge_defs:
        _, created = get_or_create(db, ExtraCharge, category_id=category.id, name=name, defaults={"charge_type": charge_type, "amount": amount, "is_active": True})
        created_counts["extra_charges"] += int(created)

    product, created = get_or_create(db, Product, name="Digital Banner", category_id=category.id, defaults={"pricing_type": ProductPricingType.per_area, "is_active": True})
    created_counts["products"] += int(created)
    for media_value in MEDIA_OPTIONS:
        options = [(media_attr.id, media_options[media_value].id)]
        _, created = get_or_create_cell(db, product.id, slab.id, options, 0.0)
        created_counts["cells"] += int(created)

    db.commit()

    print("Digital Banner catalog seeded successfully.")
    for key, count in created_counts.items():
        print(f"  {key}: {count} newly created")


if __name__ == "__main__":
    main()
