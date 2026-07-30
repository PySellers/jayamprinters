"""
Seeds the "Bill Books & Stationery" catalog structure from the client PDF
(pages 11-13: Letter Pad / Bill Book / Delivery Challan / Gate Pass / Cash
Voucher / Cash Memo / Invoice / Trip Sheet / Visitor Pass / Prescription /
Memo / Estimate / Exam Sheet).

Modeling note: the PDF's rate tables (pages 12-13) are keyed purely by
size-fraction x paper/GSM type x quantity bracket -- identical regardless of
which of the 13 document types is being printed (it's the same commodity
sheet-printing rate, just different content imprinted on it). So:
  - one Product per size-fraction (12 total) carries the priced matrix
    (Paper/GSM Type x Quantity Bracket)
  - the 13 document-type labels have no rate impact in the source PDF and
    belong on the quotation item's free-text `spec_notes` field, not as a
    priced attribute (doing otherwise would force a 13x multiplication of
    every price cell for no reason)
  - NCR/Bill-Type copy count (Single-Eight Bill) and Binding are priced
    independently via ExtraCharge, since the PDF shows them as separate
    Rs. tables, not crossed into the GSM grid

All price-matrix cells / extra charges are seeded at Rs.0 (placeholder) --
fill in real rates via Pricing Setup / Price Matrix.

Document type labels for staff reference (type into spec_notes when taking
an order): Letter Pad, Bill Book, Delivery Challan, Gate Pass, Cash Voucher,
Cash Memo, Invoice, Trip Sheet, Visitor Pass, Prescription, Memo, Estimate,
Exam Sheet.

Safe to re-run.

Usage:
    cd backend && venv\\Scripts\\activate && python seed_bill_books.py
"""

from app.core.database import SessionLocal
from app.models.product import ProductCategory, Product, ProductPricingType
from app.models.attribute import Attribute
from app.models.extra_charge import ExtraCharge, ChargeType
from app.utils.seed_helpers import get_or_create, get_or_create_option, get_or_create_slab, get_or_create_cell

db = SessionLocal()

SIZE_FRACTIONS = ["1/3", "1/4", "1/5", "1/6", "1/6 Length", "1/8", "1/8 Length", "1/10", "1/12", "1/16", "1/24", "A3"]
PAPER_OPTIONS = [
    "54 GSM", "60 GSM", "70 GSM", "80 GSM", "85 GSM", "90 GSM", "100 GSM", "120 GSM",
    "Royal Ex.Bond 100", "Royal Ex.Bond 90", "Royal Ex.Bond 80", "Royal Ex.Bond 70",
    "Ledger 100", "Ledger 90", "Ledger 80",
]


def main():
    created_counts = {"categories": 0, "attributes": 0, "options": 0, "slabs": 0, "extra_charges": 0, "products": 0, "cells": 0}

    category, created = get_or_create(db, ProductCategory, name="Bill Books & Stationery", defaults={"is_active": True})
    created_counts["categories"] += int(created)

    paper_attr, created = get_or_create(db, Attribute, category_id=category.id, name="Paper/GSM Type", defaults={"is_required": True, "display_order": 1})
    created_counts["attributes"] += int(created)
    paper_options = {}
    for i, value in enumerate(PAPER_OPTIONS):
        opt, created = get_or_create_option(db, paper_attr.id, value, display_order=i)
        paper_options[value] = opt
        created_counts["options"] += int(created)

    slab_defs = [
        (1, 1000, "1st 1000 Nos", 1),
        (1001, None, "Add. 1000 Nos", 2),
    ]
    slabs = []
    for min_q, max_q, label, order in slab_defs:
        slab, created = get_or_create_slab(db, category.id, min_q, max_q, label, order)
        slabs.append(slab)
        created_counts["slabs"] += int(created)

    extra_charge_defs = [
        ("Bill Type - Single Bill", ChargeType.flat, 0.0),
        ("Bill Type - Two Bill (NCR)", ChargeType.flat, 0.0),
        ("Bill Type - Three Bill (NCR)", ChargeType.flat, 0.0),
        ("Bill Type - Four Bill (NCR)", ChargeType.flat, 0.0),
        ("Bill Type - Six Bill (NCR)", ChargeType.flat, 0.0),
        ("Bill Type - Eight Bill (NCR)", ChargeType.flat, 0.0),
        ("Binding - Loose Sheet", ChargeType.flat, 0.0),
        ("Binding - Pad", ChargeType.flat, 0.0),
        ("Binding - Soft Binding", ChargeType.flat, 0.0),
        ("Binding - Hard Binding", ChargeType.flat, 0.0),
        ("Binding Set - 25 Set", ChargeType.flat, 0.0),
        ("Binding Set - 50 Set", ChargeType.flat, 0.0),
        ("Binding Set - 100 Set", ChargeType.flat, 0.0),
        ("Binding Set - 200 Set", ChargeType.flat, 0.0),
    ]
    for name, charge_type, amount in extra_charge_defs:
        _, created = get_or_create(db, ExtraCharge, category_id=category.id, name=name, defaults={"charge_type": charge_type, "amount": amount, "is_active": True})
        created_counts["extra_charges"] += int(created)

    for size_fraction in SIZE_FRACTIONS:
        product, created = get_or_create(db, Product, name=f"Sheet Printing - {size_fraction}", category_id=category.id, defaults={"pricing_type": ProductPricingType.matrix, "is_active": True})
        created_counts["products"] += int(created)
        for paper_value in PAPER_OPTIONS:
            for slab in slabs:
                options = [(paper_attr.id, paper_options[paper_value].id)]
                _, created = get_or_create_cell(db, product.id, slab.id, options, 0.0)
                created_counts["cells"] += int(created)

    db.commit()

    print("Bill Books & Stationery catalog seeded successfully.")
    for key, count in created_counts.items():
        print(f"  {key}: {count} newly created")


if __name__ == "__main__":
    main()
