"""
Seeds the "Binding Services" catalog structure from the client PDF (page 14:
Binding Type, Project Binding, Wrapper Print).

Unlike most categories, this page shows no quantity-bracket rate grid --
binding is priced per book/document, mostly via a menu of binding types
each with their own flat rate. A single catch-all "Per Unit" quantity slab
is used so the pricing engine's matrix lookup still has something to key
on.

All prices seeded at Rs.0 (placeholder) -- fill in real rates via Pricing
Setup / Price Matrix.

Safe to re-run.

Usage:
    cd backend && venv\\Scripts\\activate && python seed_binding.py
"""

from app.core.database import SessionLocal
from app.models.product import ProductCategory, Product, ProductPricingType
from app.models.attribute import Attribute
from app.models.extra_charge import ExtraCharge, ChargeType
from app.utils.seed_helpers import get_or_create, get_or_create_option, get_or_create_slab, get_or_create_cell

db = SessionLocal()

PROJECT_BINDING_MATERIALS = ["Paper Rexon", "Diamond Rexon", "Leather"]
WRAPPER_PRINT_TYPES = ["Art Board Print - Without Lamination", "Art Board Print - With Lamination", "Leather Printing - Screen", "Leather Printing - Leather"]


def main():
    created_counts = {"categories": 0, "attributes": 0, "options": 0, "slabs": 0, "extra_charges": 0, "products": 0, "cells": 0}

    category, created = get_or_create(db, ProductCategory, name="Binding Services", defaults={"is_active": True})
    created_counts["categories"] += int(created)

    slab, created = get_or_create_slab(db, category.id, 1, None, "Per Unit", 1)
    created_counts["slabs"] += int(created)

    material_attr, created = get_or_create(db, Attribute, category_id=category.id, name="Binding Material", defaults={"is_required": True, "display_order": 1})
    created_counts["attributes"] += int(created)
    material_options = {}
    for i, value in enumerate(PROJECT_BINDING_MATERIALS):
        opt, created = get_or_create_option(db, material_attr.id, value, display_order=i)
        material_options[value] = opt
        created_counts["options"] += int(created)

    print_type_attr, created = get_or_create(db, Attribute, category_id=category.id, name="Wrapper Print Type", defaults={"is_required": True, "display_order": 2})
    created_counts["attributes"] += int(created)
    print_type_options = {}
    for i, value in enumerate(WRAPPER_PRINT_TYPES):
        opt, created = get_or_create_option(db, print_type_attr.id, value, display_order=i)
        print_type_options[value] = opt
        created_counts["options"] += int(created)

    extra_charge_defs = [
        ("Binding Type - Stitching Only", ChargeType.flat, 0.0),
        ("Binding Type - Soft Binding", ChargeType.flat, 0.0),
        ("Binding Type - Spiral Binding", ChargeType.flat, 0.0),
        ("Binding Type - Lamination Binding", ChargeType.flat, 0.0),
        ("Binding Type - Without Stitch", ChargeType.flat, 0.0),
        ("Binding Type - Hard Binding", ChargeType.flat, 0.0),
        ("Binding Type - Hard Binding Corner", ChargeType.flat, 0.0),
        ("Binding Type - Paper Rexon", ChargeType.flat, 0.0),
        ("Binding Type - Diamond Rexon", ChargeType.flat, 0.0),
        ("Binding Type - Diamond Rexon Corner", ChargeType.flat, 0.0),
        ("Leather Binding - With Marble", ChargeType.flat, 0.0),
        ("Leather Binding - Corner", ChargeType.flat, 0.0),
        ("Leather Binding - Paper Rexon", ChargeType.flat, 0.0),
        ("Leather Binding - With Diamond Rexon", ChargeType.flat, 0.0),
    ]
    for name, charge_type, amount in extra_charge_defs:
        _, created = get_or_create(db, ExtraCharge, category_id=category.id, name=name, defaults={"charge_type": charge_type, "amount": amount, "is_active": True})
        created_counts["extra_charges"] += int(created)

    project_binding, created = get_or_create(db, Product, name="Project Binding", category_id=category.id, defaults={"pricing_type": ProductPricingType.matrix, "is_active": True})
    created_counts["products"] += int(created)
    for value in PROJECT_BINDING_MATERIALS:
        options = [(material_attr.id, material_options[value].id)]
        _, created = get_or_create_cell(db, project_binding.id, slab.id, options, 0.0)
        created_counts["cells"] += int(created)

    wrapper_print, created = get_or_create(db, Product, name="Wrapper Print", category_id=category.id, defaults={"pricing_type": ProductPricingType.matrix, "is_active": True})
    created_counts["products"] += int(created)
    for value in WRAPPER_PRINT_TYPES:
        options = [(print_type_attr.id, print_type_options[value].id)]
        _, created = get_or_create_cell(db, wrapper_print.id, slab.id, options, 0.0)
        created_counts["cells"] += int(created)

    db.commit()

    print("Binding Services catalog seeded successfully.")
    for key, count in created_counts.items():
        print(f"  {key}: {count} newly created")


if __name__ == "__main__":
    main()
