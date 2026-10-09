"""
Configures the "Bill Books & Stationery" service for the guided, step-by-step
order screen (client request, Oct 2026). Builds on seed_bill_books.py -- run
that first.

What it sets up (all prices Rs.0 until the client supplies rates; fill them in
via Pricing Setup):
  - category flag guided_flow = 'bill_book'  (switches on the step-by-step screen)
  - descriptive attributes that are NOT part of the price-matrix key:
      Document Type (13), Paper Name (11), Paper Colour (7),
      Copies per Set (1+1 .. 1+6), Print Side (2)
  - Bill Type / Binding Type become single-choice charge groups
  - Binding Model (4) is a new single-choice charge group
  - Binding Set is priced per copies-per-set (the PDF's brace: binding charge
    varies with the 1+N paper count), so the old 4 generic set charges are
    deactivated and replaced by set-size x copies charges that only apply
    when that copies option is chosen.

Safe to re-run (everything is get-or-create by name).

Usage:
    cd backend && venv\\Scripts\\activate && python seed_bill_book_guided.py
"""

from app.core.database import SessionLocal
from app.models.product import ProductCategory
from app.models.attribute import Attribute, AttributeOption
from app.models.extra_charge import ExtraCharge, ChargeType
from app.utils.seed_helpers import get_or_create, get_or_create_option

CATEGORY_NAME = "Bill Books & Stationery"

DOCUMENT_TYPES = [
    "Letter Pad", "Bill Book", "Delivery Challan", "Gate Pass", "Cash Voucher", "Cash Memo", "Invoice",
    "Trip Sheet", "Visitor Pass", "Prescription", "Memo", "Estimate", "Exam Sheet",
]
PAPER_NAMES = [
    "Royal Ex.Bond", "Excel Bond", "Palarpur", "Westcost", "Sheshai", "Sirpur",
    "Seshai Ledger", "Sirpur Ledger", "Westcos Ledger", "Foreign Paper", "Custom",
]
PAPER_COLOURS = ["White", "Pink", "Yellow", "Green", "Blue", "Rough", "Custom"]
COPIES = ["1+1", "1+2", "1+3", "1+4", "1+5", "1+6"]
PRINT_SIDES = ["Single Side", "Front Back"]
BINDING_MODELS = ["Top Binding", "Side Binding", "Bottom Binding", "Center Stitching"]
BINDING_SET_SIZES = ["25 Set", "50 Set", "100 Set", "200 Set", "Custom"]

db = SessionLocal()


def ensure_attribute(category, name, options, display_order):
    attr, _ = get_or_create(
        db, Attribute, category_id=category.id, name=name,
        defaults={"is_required": False, "display_order": display_order, "in_price_matrix": False},
    )
    # Descriptive attributes must never join the price-cell key.
    attr.in_price_matrix = False
    attr.display_order = display_order
    opts = {}
    for i, value in enumerate(options):
        opt, _ = get_or_create_option(db, attr.id, value, display_order=i)
        opts[value] = opt
    return attr, opts


def ensure_charge(category, name, group, requires_option_id=None):
    charge, created = get_or_create(
        db, ExtraCharge, category_id=category.id, name=name,
        defaults={"charge_type": ChargeType.flat, "amount": 0.0, "is_active": True},
    )
    charge.group_name = group
    charge.requires_option_id = requires_option_id
    charge.is_active = True
    return created


def main():
    category = db.query(ProductCategory).filter_by(name=CATEGORY_NAME).first()
    if not category:
        raise SystemExit(f'Category "{CATEGORY_NAME}" not found -- run seed_bill_books.py first.')
    category.guided_flow = "bill_book"

    # Keep the existing priced attribute (Paper/GSM Type) in the matrix key and slot it after Paper Name.
    gsm_attr = db.query(Attribute).filter_by(category_id=category.id, name="Paper/GSM Type").first()
    if gsm_attr:
        gsm_attr.in_price_matrix = True
        gsm_attr.display_order = 3

    ensure_attribute(category, "Document Type", DOCUMENT_TYPES, 1)
    ensure_attribute(category, "Paper Name", PAPER_NAMES, 2)
    ensure_attribute(category, "Paper Colour", PAPER_COLOURS, 4)
    _, copies_opts = ensure_attribute(category, "Copies per Set", COPIES, 5)
    ensure_attribute(category, "Print Side", PRINT_SIDES, 6)

    created = 0

    # Existing seeded charges -> make them single-choice groups.
    for charge in db.query(ExtraCharge).filter_by(category_id=category.id).all():
        if charge.name.startswith("Bill Type - "):
            charge.group_name = "Bill Type"
        elif charge.name.startswith("Binding - "):
            charge.group_name = "Binding Type"
    created += ensure_charge(category, "Binding - Custom", "Binding Type")

    for model in BINDING_MODELS:
        created += ensure_charge(category, f"Binding Model - {model}", "Binding Model")

    # Binding set price depends on the copies count -> one charge per (set size, copies).
    for old in db.query(ExtraCharge).filter(
        ExtraCharge.category_id == category.id,
        ExtraCharge.name.in_([f"Binding Set - {s}" for s in BINDING_SET_SIZES]),
    ):
        old.is_active = False  # kept (not deleted): past quotations may reference them
    for size in BINDING_SET_SIZES:
        for copies in COPIES:
            created += ensure_charge(
                category, f"Binding Set - {size} ({copies})", "Binding Set",
                requires_option_id=copies_opts[copies].id,
            )

    db.commit()
    print("Bill Book guided-flow data configured.")
    print(f"  new extra charges: {created}")
    print("  all new prices are Rs.0 -- enter real rates in Pricing Setup (or the rate import).")


if __name__ == "__main__":
    main()
