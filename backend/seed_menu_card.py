"""
Seeds the "Menu Card" catalog structure from the client PDF (page 22).

Core priced matrix: Paper/GSM Type (Art Paper + Maplitho GSM values) crossed
with quantity brackets. Designing, Lamination, Special Work, Board type,
and the two Binding option sets are independent ExtraCharges (drawn as
separate boxes in the PDF).

All prices seeded at Rs.0 (placeholder) -- fill in real rates via Pricing
Setup / Price Matrix.

Safe to re-run.

Usage:
    cd backend && venv\\Scripts\\activate && python seed_menu_card.py
"""

from app.core.database import SessionLocal
from app.models.product import ProductCategory, Product, ProductPricingType
from app.models.attribute import Attribute
from app.models.extra_charge import ExtraCharge, ChargeType
from app.utils.seed_helpers import get_or_create, get_or_create_option, get_or_create_slab, get_or_create_cell

db = SessionLocal()

GSM_VALUES = ["80", "90", "100", "130", "170", "250", "300"]
PAPER_OPTIONS = [f"Art Paper {g} GSM" for g in GSM_VALUES] + [f"Maplitho Paper {g} GSM" for g in GSM_VALUES]


def main():
    created_counts = {"categories": 0, "attributes": 0, "options": 0, "slabs": 0, "extra_charges": 0, "products": 0, "cells": 0}

    category, created = get_or_create(db, ProductCategory, name="Menu Card", defaults={"is_active": True})
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
        ("Designing Charge", ChargeType.flat, 0.0),
        ("Lamination - Glass", ChargeType.flat, 0.0),
        ("Lamination - Matt", ChargeType.flat, 0.0),
        ("Lamination - 3D", ChargeType.flat, 0.0),
        ("Lamination - Thermal Glass", ChargeType.flat, 0.0),
        ("Lamination - Thermal Matt", ChargeType.flat, 0.0),
        ("Special Work - Nurling", ChargeType.flat, 0.0),
        ("Special Work - Gold Foiling", ChargeType.flat, 0.0),
        ("Special Work - Silver Foiling", ChargeType.flat, 0.0),
        ("Special Work - Emposing", ChargeType.flat, 0.0),
        ("Board - Art Board", ChargeType.flat, 0.0),
        ("Board - Matt Art", ChargeType.flat, 0.0),
        ("Board - Criss Cross Board", ChargeType.flat, 0.0),
        ("Board - Needlepoint Board", ChargeType.flat, 0.0),
        ("Board - Gold Metalik", ChargeType.flat, 0.0),
        ("Board - Silver Metalik", ChargeType.flat, 0.0),
        ("Board - Nurling Board", ChargeType.flat, 0.0),
        ("Board - Special Board", ChargeType.flat, 0.0),
        ("Binding - Soft Binding", ChargeType.flat, 0.0),
        ("Binding - Hard Binding", ChargeType.flat, 0.0),
        ("Binding - Calico Binding", ChargeType.flat, 0.0),
        ("Binding - Paper Rexon", ChargeType.flat, 0.0),
        ("Binding - Rexon Binding", ChargeType.flat, 0.0),
        ("Binding - Rexon Corner", ChargeType.flat, 0.0),
        ("Binding - Full Rexon", ChargeType.flat, 0.0),
        ("Binding - Leather", ChargeType.flat, 0.0),
        ("Binding - Leather Corner", ChargeType.flat, 0.0),
        ("Binding - Pouch Lamination", ChargeType.flat, 0.0),
        ("Binding - Soft Biding", ChargeType.flat, 0.0),
        ("Binding - Karishma Bind", ChargeType.flat, 0.0),
        ("Binding - Wiro Biding", ChargeType.flat, 0.0),
        ("Binding - Spiral Binding", ChargeType.flat, 0.0),
        ("Binding - Case Biding", ChargeType.flat, 0.0),
    ]
    for name, charge_type, amount in extra_charge_defs:
        _, created = get_or_create(db, ExtraCharge, category_id=category.id, name=name, defaults={"charge_type": charge_type, "amount": amount, "is_active": True})
        created_counts["extra_charges"] += int(created)

    product, created = get_or_create(db, Product, name="Menu Card", category_id=category.id, defaults={"pricing_type": ProductPricingType.matrix, "is_active": True})
    created_counts["products"] += int(created)
    for paper_value in PAPER_OPTIONS:
        for slab in slabs:
            options = [(paper_attr.id, paper_options[paper_value].id)]
            _, created = get_or_create_cell(db, product.id, slab.id, options, 0.0)
            created_counts["cells"] += int(created)

    db.commit()

    print("Menu Card catalog seeded successfully.")
    for key, count in created_counts.items():
        print(f"  {key}: {count} newly created")


if __name__ == "__main__":
    main()
