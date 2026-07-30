"""
Seeds the "Book Covers" catalog structure from the client PDF (pages 9-10:
Cover - Offset, Readymade Cover).

All price-matrix cells / option extra-prices are seeded at Rs.0 (placeholder)
-- the PDF's rate tables are blank templates for this category. Fill in real
rates via Pricing Setup / Price Matrix.

Modeling note: "Cover - Offset" prices by paper/board type crossed with
quantity brackets (matches the PDF's rate grid on page 9). "Readymade Cover"
instead prices by a flat per-size cover charge (page 10's "Size -> Cover
Charges" table) layered on top of a quantity-bracket printing charge -- the
per-size charge is modeled via `AttributeOption.extra_price` rather than a
crossed attribute, since size doesn't affect the printing-charge grid itself.

Safe to re-run.

Usage:
    cd backend && venv\\Scripts\\activate && python seed_book_covers.py
"""

from app.core.database import SessionLocal
from app.models.product import ProductCategory, Product, ProductPricingType
from app.models.attribute import Attribute
from app.models.extra_charge import ExtraCharge, ChargeType
from app.utils.seed_helpers import get_or_create, get_or_create_option, get_or_create_slab, get_or_create_cell

db = SessionLocal()

PAPER_OPTIONS = ["Maplitho Paper", "Art Paper", "Art Board", "Duplex Paper", "Duplex Board", "Metallic Board", "Brown Paper"]
COVER_SIZE_OPTIONS = ["8x6", "7.5x5.5", "7x5", "7x4", "6.5x4.5", "6x4", "8x5", "8.5x5.5", "9x6", "9.5x6.5", "9x4", "10.5x4.5",
                      "12x8", "12x9", "12x10", "9x14 (Legal)", "12x17 (A3)", "15x20", "Viboothi Cover", "Custom"]


def main():
    created_counts = {"categories": 0, "attributes": 0, "options": 0, "slabs": 0, "extra_charges": 0, "products": 0, "cells": 0}

    category, created = get_or_create(db, ProductCategory, name="Book Covers", defaults={"is_active": True})
    created_counts["categories"] += int(created)

    paper_attr, created = get_or_create(db, Attribute, category_id=category.id, name="Paper/Board Type", defaults={"is_required": True, "display_order": 1})
    created_counts["attributes"] += int(created)
    paper_options = {}
    for i, value in enumerate(PAPER_OPTIONS):
        opt, created = get_or_create_option(db, paper_attr.id, value, display_order=i)
        paper_options[value] = opt
        created_counts["options"] += int(created)

    cover_size_attr, created = get_or_create(db, Attribute, category_id=category.id, name="Cover Size", defaults={"is_required": True, "display_order": 2})
    created_counts["attributes"] += int(created)
    cover_size_options = {}
    for i, value in enumerate(COVER_SIZE_OPTIONS):
        opt, created = get_or_create_option(db, cover_size_attr.id, value, extra_price=0.0, display_order=i)
        cover_size_options[value] = opt
        created_counts["options"] += int(created)

    slab_defs = [
        (1, 500, "1 - 500 Nos (Offset)", 1),
        (501, 1000, "501 - 1000 Nos (Offset)", 2),
        (1, 100, "1 - 100 Nos (Screen)", 3),
        (1, 50, "1 - 50 Nos (Digital)", 4),
    ]
    slabs = []
    for min_q, max_q, label, order in slab_defs:
        slab, created = get_or_create_slab(db, category.id, min_q, max_q, label, order)
        slabs.append(slab)
        created_counts["slabs"] += int(created)

    extra_charge_defs = [
        ("Lamination - Glass", ChargeType.flat, 0.0),
        ("Lamination - Matt", ChargeType.flat, 0.0),
        ("Lamination - 3D", ChargeType.flat, 0.0),
        ("Special Work - Nurling", ChargeType.flat, 0.0),
        ("Special Work - Gold Foiling", ChargeType.flat, 0.0),
        ("Special Work - Silver Foiling", ChargeType.flat, 0.0),
        ("Special Work - Emposing", ChargeType.flat, 0.0),
    ]
    for name, charge_type, amount in extra_charge_defs:
        _, created = get_or_create(db, ExtraCharge, category_id=category.id, name=name, defaults={"charge_type": charge_type, "amount": amount, "is_active": True})
        created_counts["extra_charges"] += int(created)

    # Cover - Offset: priced by paper/board type x quantity bracket
    offset_product, created = get_or_create(db, Product, name="Cover - Offset", category_id=category.id, defaults={"pricing_type": ProductPricingType.matrix, "is_active": True})
    created_counts["products"] += int(created)
    for paper_value in PAPER_OPTIONS:
        for slab in slabs[:2]:  # the two offset brackets
            options = [(paper_attr.id, paper_options[paper_value].id)]
            _, created = get_or_create_cell(db, offset_product.id, slab.id, options, 0.0)
            created_counts["cells"] += int(created)

    # Readymade Cover: printing charge by quantity bracket, cover charge layered via Cover Size extra_price
    readymade_product, created = get_or_create(db, Product, name="Readymade Cover", category_id=category.id, defaults={"pricing_type": ProductPricingType.matrix, "is_active": True})
    created_counts["products"] += int(created)
    for size_value in COVER_SIZE_OPTIONS:
        for slab in slabs:
            options = [(cover_size_attr.id, cover_size_options[size_value].id)]
            _, created = get_or_create_cell(db, readymade_product.id, slab.id, options, 0.0)
            created_counts["cells"] += int(created)

    db.commit()

    print("Book Covers catalog seeded successfully.")
    for key, count in created_counts.items():
        print(f"  {key}: {count} newly created")


if __name__ == "__main__":
    main()
