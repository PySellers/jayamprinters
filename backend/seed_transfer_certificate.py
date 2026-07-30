"""
Seeds the "Transfer Certificate" catalog structure from the client PDF
(page 16: T.C. or Transfer Certificate).

Same modeling approach as Register: Size x Side is the core priced matrix
(crossed with page-count bands), Paper Name / Printing Color / Binding /
Binding Set are independent ExtraCharges.

All prices seeded at Rs.0 (placeholder) -- fill in real rates via Pricing
Setup / Price Matrix.

Safe to re-run.

Usage:
    cd backend && venv\\Scripts\\activate && python seed_transfer_certificate.py
"""

from app.core.database import SessionLocal
from app.models.product import ProductCategory, Product, ProductPricingType
from app.models.attribute import Attribute
from app.models.extra_charge import ExtraCharge, ChargeType
from app.utils.seed_helpers import get_or_create, get_or_create_option, get_or_create_slab, get_or_create_cell

db = SessionLocal()

SIZE_OPTIONS = ["15x20", "12x18", "11.5x18 (A3)", "12.5x18 (A3)", "A4 (210x297mm)", "A4", "A5"]
SIDE_OPTIONS = ["Single Side", "Both Side"]
PAGE_COUNTS = [50, 100, 200, 300, 400, 500]


def main():
    created_counts = {"categories": 0, "attributes": 0, "options": 0, "slabs": 0, "extra_charges": 0, "products": 0, "cells": 0}

    category, created = get_or_create(db, ProductCategory, name="Transfer Certificate", defaults={"is_active": True})
    created_counts["categories"] += int(created)

    size_attr, created = get_or_create(db, Attribute, category_id=category.id, name="Size", defaults={"is_required": True, "display_order": 1})
    created_counts["attributes"] += int(created)
    size_options = {}
    for i, value in enumerate(SIZE_OPTIONS):
        opt, created = get_or_create_option(db, size_attr.id, value, display_order=i)
        size_options[value] = opt
        created_counts["options"] += int(created)

    side_attr, created = get_or_create(db, Attribute, category_id=category.id, name="Side", defaults={"is_required": True, "display_order": 2})
    created_counts["attributes"] += int(created)
    side_options = {}
    for i, value in enumerate(SIDE_OPTIONS):
        opt, created = get_or_create_option(db, side_attr.id, value, display_order=i)
        side_options[value] = opt
        created_counts["options"] += int(created)

    slabs = []
    for i, pages in enumerate(PAGE_COUNTS):
        slab, created = get_or_create_slab(db, category.id, pages, pages, f"{pages} Pages", i)
        slabs.append(slab)
        created_counts["slabs"] += int(created)

    extra_charge_defs = [
        ("Paper Name - White Paper", ChargeType.flat, 0.0),
        ("Paper Name - Royal Ex.Bond", ChargeType.flat, 0.0),
        ("Paper Name - Excel Bond", ChargeType.flat, 0.0),
        ("Paper Name - Ledger Paper", ChargeType.flat, 0.0),
        ("Paper Name - Foreign Paper", ChargeType.flat, 0.0),
        ("Paper Name - Special Paper", ChargeType.flat, 0.0),
        ("Printing Color - 1 Color", ChargeType.flat, 0.0),
        ("Printing Color - 2 Color", ChargeType.flat, 0.0),
        ("Printing Color - 3 Color", ChargeType.flat, 0.0),
        ("Printing Color - Multi Color", ChargeType.flat, 0.0),
        ("Binding - Soft Binding", ChargeType.flat, 0.0),
        ("Binding - Hard Binding", ChargeType.flat, 0.0),
        ("Binding - Calico Binding", ChargeType.flat, 0.0),
        ("Binding - Paper Rexon", ChargeType.flat, 0.0),
        ("Binding - Rexon Binding", ChargeType.flat, 0.0),
        ("Binding - Rexon Corner", ChargeType.flat, 0.0),
        ("Binding - Full Rexon", ChargeType.flat, 0.0),
        ("Binding - Leather", ChargeType.flat, 0.0),
        ("Binding - Leather Corner", ChargeType.flat, 0.0),
        ("Binding Set - 25 Set", ChargeType.flat, 0.0),
        ("Binding Set - 50 Set", ChargeType.flat, 0.0),
        ("Binding Set - 100 Set", ChargeType.flat, 0.0),
        ("Binding Set - 200 Set", ChargeType.flat, 0.0),
    ]
    for name, charge_type, amount in extra_charge_defs:
        _, created = get_or_create(db, ExtraCharge, category_id=category.id, name=name, defaults={"charge_type": charge_type, "amount": amount, "is_active": True})
        created_counts["extra_charges"] += int(created)

    product, created = get_or_create(db, Product, name="Transfer Certificate", category_id=category.id, defaults={"pricing_type": ProductPricingType.matrix, "is_active": True})
    created_counts["products"] += int(created)
    for size_value in SIZE_OPTIONS:
        for side_value in SIDE_OPTIONS:
            for slab in slabs:
                options = [(size_attr.id, size_options[size_value].id), (side_attr.id, side_options[side_value].id)]
                _, created = get_or_create_cell(db, product.id, slab.id, options, 0.0)
                created_counts["cells"] += int(created)

    db.commit()

    print("Transfer Certificate catalog seeded successfully.")
    for key, count in created_counts.items():
        print(f"  {key}: {count} newly created")


if __name__ == "__main__":
    main()
