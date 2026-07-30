"""
Seeds the "Application Form" catalog structure from the client PDF (page 17).

Core priced matrix: Paper/GSM Type (Maplitho + Art Paper GSM values) crossed
with quantity brackets. Side and Folding are independent ExtraCharges (drawn
as separate boxes in the PDF, not crossed into the GSM grid).

All prices seeded at Rs.0 (placeholder) -- fill in real rates via Pricing
Setup / Price Matrix.

Safe to re-run.

Usage:
    cd backend && venv\\Scripts\\activate && python seed_application_form.py
"""

from app.core.database import SessionLocal
from app.models.product import ProductCategory, Product, ProductPricingType
from app.models.attribute import Attribute
from app.models.extra_charge import ExtraCharge, ChargeType
from app.utils.seed_helpers import get_or_create, get_or_create_option, get_or_create_slab, get_or_create_cell

db = SessionLocal()

PAPER_OPTIONS = [
    "Maplitho 54 GSM", "Maplitho 60 GSM", "Maplitho 70 GSM", "Maplitho 80 GSM", "Maplitho 85 GSM", "Maplitho 90 GSM", "Maplitho 100 GSM", "Maplitho 120 GSM",
    "Art Paper 80 GSM", "Art Paper 90 GSM", "Art Paper 100 GSM", "Art Paper 130 GSM", "Art Paper 170 GSM", "Art Paper 250 GSM", "Art Paper 300 GSM",
]


def main():
    created_counts = {"categories": 0, "attributes": 0, "options": 0, "slabs": 0, "extra_charges": 0, "products": 0, "cells": 0}

    category, created = get_or_create(db, ProductCategory, name="Application Form", defaults={"is_active": True})
    created_counts["categories"] += int(created)

    paper_attr, created = get_or_create(db, Attribute, category_id=category.id, name="Paper/GSM Type", defaults={"is_required": True, "display_order": 1})
    created_counts["attributes"] += int(created)
    paper_options = {}
    for i, value in enumerate(PAPER_OPTIONS):
        opt, created = get_or_create_option(db, paper_attr.id, value, display_order=i)
        paper_options[value] = opt
        created_counts["options"] += int(created)

    slab_defs = [
        (1, 50, "50 Nos", 1),
        (51, 100, "100 Nos", 2),
        (101, 500, "Maximum Digital Qty", 3),
        (501, None, "Additional Each 1", 4),
    ]
    slabs = []
    for min_q, max_q, label, order in slab_defs:
        slab, created = get_or_create_slab(db, category.id, min_q, max_q, label, order)
        slabs.append(slab)
        created_counts["slabs"] += int(created)

    extra_charge_defs = [
        ("Side - Both Side Printing", ChargeType.flat, 0.0),
        ("Folding - Two Folding", ChargeType.flat, 0.0),
        ("Folding - Three Folding", ChargeType.flat, 0.0),
        ("Folding - 4 Folding", ChargeType.flat, 0.0),
        ("Folding - Booklet", ChargeType.flat, 0.0),
    ]
    for name, charge_type, amount in extra_charge_defs:
        _, created = get_or_create(db, ExtraCharge, category_id=category.id, name=name, defaults={"charge_type": charge_type, "amount": amount, "is_active": True})
        created_counts["extra_charges"] += int(created)

    product, created = get_or_create(db, Product, name="Application Form", category_id=category.id, defaults={"pricing_type": ProductPricingType.matrix, "is_active": True})
    created_counts["products"] += int(created)
    for paper_value in PAPER_OPTIONS:
        for slab in slabs:
            options = [(paper_attr.id, paper_options[paper_value].id)]
            _, created = get_or_create_cell(db, product.id, slab.id, options, 0.0)
            created_counts["cells"] += int(created)

    db.commit()

    print("Application Form catalog seeded successfully.")
    for key, count in created_counts.items():
        print(f"  {key}: {count} newly created")


if __name__ == "__main__":
    main()
