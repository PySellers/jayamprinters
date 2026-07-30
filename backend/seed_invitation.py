"""
Seeds the "Invitation & Greeting Cards" catalog structure from the client PDF
(Jayam Printers Software-009.pdf, pages 4-9: Invitation, Redymade Invitation,
Multicolor Cards, Color Board).

All price-matrix cells are seeded at Rs.0 (placeholder) since the PDF's rate
tables are blank templates with no real figures for this category (unlike
Rubber Stamp, which has real prices). Fill in real rates via the Pricing
Setup / Price Matrix admin pages.

Document-type labels shown in the PDF as sharing this same rate structure
(Progress Report, Rank Card, Mark Sheet, Tag, Fund Card, Greeting Card,
Office Card) are not modeled as separate priced attributes -- they have no
rate impact in the source document, so they belong on the quotation item's
free-text `spec_notes` field instead of forcing a combinatorial blow-up of
the price matrix.

Safe to re-run: every entity is fetched-or-created, so running this twice
won't create duplicates.

Usage:
    cd backend && venv\\Scripts\\activate && python seed_invitation.py
"""

from app.core.database import SessionLocal
from app.models.product import ProductCategory, Product, ProductPricingType
from app.models.attribute import Attribute
from app.models.extra_charge import ExtraCharge, ChargeType
from app.utils.seed_helpers import get_or_create, get_or_create_option, get_or_create_slab, get_or_create_cell

db = SessionLocal()

PAPER_OPTIONS = ["Maplitho Paper", "Art Paper", "Art Board", "Duplex Paper", "Duplex Board", "Metallic Board", "Laminated Board"]
SIDE_OPTIONS = ["Single Side", "Both Side"]


def main():
    created_counts = {"categories": 0, "attributes": 0, "options": 0, "slabs": 0, "extra_charges": 0, "products": 0, "cells": 0}

    category, created = get_or_create(db, ProductCategory, name="Invitation & Greeting Cards", defaults={"is_active": True})
    created_counts["categories"] += int(created)

    paper_attr, created = get_or_create(db, Attribute, category_id=category.id, name="Paper/Board Type", defaults={"is_required": True, "display_order": 1})
    created_counts["attributes"] += int(created)
    paper_options = {}
    for i, value in enumerate(PAPER_OPTIONS):
        opt, created = get_or_create_option(db, paper_attr.id, value, display_order=i)
        paper_options[value] = opt
        created_counts["options"] += int(created)

    side_attr, created = get_or_create(db, Attribute, category_id=category.id, name="Side", defaults={"is_required": True, "display_order": 2})
    created_counts["attributes"] += int(created)
    side_options = {}
    for i, value in enumerate(SIDE_OPTIONS):
        opt, created = get_or_create_option(db, side_attr.id, value, display_order=i)
        side_options[value] = opt
        created_counts["options"] += int(created)

    slab_defs = [
        (1, 500, "1 - 500 Nos", 1),
        (501, 1000, "501 - 1000 Nos", 2),
        (1001, None, "1000+ Nos", 3),
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
        ("Lamination - Thermal Glass", ChargeType.flat, 0.0),
        ("Lamination - Thermal Matt", ChargeType.flat, 0.0),
        ("Special Work - UV", ChargeType.flat, 0.0),
        ("Special Work - Nurling", ChargeType.flat, 0.0),
        ("Special Work - UV with Nurling", ChargeType.flat, 0.0),
        ("Special Work - Gold Foiling", ChargeType.flat, 0.0),
        ("Special Work - Silver Foiling", ChargeType.flat, 0.0),
        ("Special Work - Emposing", ChargeType.flat, 0.0),
        ("Pasting Charge", ChargeType.per_unit, 0.0),
        ("Thread Stitching", ChargeType.flat, 0.0),
        ("Bottom Folding", ChargeType.flat, 0.0),
        ("Image/Sticker Pasting", ChargeType.flat, 0.0),
        ("Designing Charge", ChargeType.flat, 0.0),
        ("Custom Work", ChargeType.flat, 0.0),
    ]
    for name, charge_type, amount in extra_charge_defs:
        _, created = get_or_create(db, ExtraCharge, category_id=category.id, name=name, defaults={"charge_type": charge_type, "amount": amount, "is_active": True})
        created_counts["extra_charges"] += int(created)

    product_defs = [
        ("Wedding Invitation - Offset", PAPER_OPTIONS),
        ("Wedding Invitation - Screen Print", PAPER_OPTIONS),
        ("Multicolor Card", PAPER_OPTIONS),
        ("Color Board", PAPER_OPTIONS),
    ]
    for product_name, paper_values in product_defs:
        product, created = get_or_create(db, Product, name=product_name, category_id=category.id, defaults={"pricing_type": ProductPricingType.matrix, "is_active": True})
        created_counts["products"] += int(created)
        for paper_value in paper_values:
            for side_value in SIDE_OPTIONS:
                for slab in slabs:
                    options = [(paper_attr.id, paper_options[paper_value].id), (side_attr.id, side_options[side_value].id)]
                    _, created = get_or_create_cell(db, product.id, slab.id, options, 0.0)
                    created_counts["cells"] += int(created)

    # Redymade Invitation: printing-charge-only on customer-supplied cards, no paper choice
    redymade, created = get_or_create(db, Product, name="Redymade Invitation", category_id=category.id, defaults={"pricing_type": ProductPricingType.matrix, "is_active": True})
    created_counts["products"] += int(created)
    for side_value in SIDE_OPTIONS:
        for slab in slabs:
            options = [(side_attr.id, side_options[side_value].id)]
            _, created = get_or_create_cell(db, redymade.id, slab.id, options, 0.0)
            created_counts["cells"] += int(created)

    db.commit()

    print("Invitation & Greeting Cards catalog seeded successfully.")
    for key, count in created_counts.items():
        print(f"  {key}: {count} newly created")


if __name__ == "__main__":
    main()
