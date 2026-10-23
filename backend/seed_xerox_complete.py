"""
Completes the "Xerox / Photocopy" service (client request, Oct 2026): every paper size,
black & white / colour, single / double side, paper GSM, and per-set binding, front
sheets, lamination and punching.

Safe to re-run, and it only fills gaps: existing prices are never changed. Defaults are
estimates for the Chennai market -- the client will adjust them in Pricing Setup.

What it sets up
  - Paper sizes: A5, B5, A4, Letter, Legal / FS, B4, A3 + large format A2, A1, A0
  - A full price grid for every size x colour x side x quantity band (only missing cells
    are created; A4 and the existing A3/A5/Legal prices are left untouched)
  - "Paper Quality" (70 GSM / Bond / Glossy) is retired: it was wired into the price
    table with no prices, so choosing any option made the line unpriceable. It is replaced
    by a "Paper GSM" choice priced as a percentage of the page rate (so it scales with size)
  - Finishing choices charged PER SET (copy of the document): Binding, Front Sheet,
    Punching; Lamination stays per page. The order screen asks for pages per set and
    the number of sets.

Usage:
    cd backend && venv\\Scripts\\activate && python seed_xerox_complete.py
"""

from app.core.database import SessionLocal
from app.models.attribute import Attribute, AttributeOption
from app.models.extra_charge import ChargeType, ExtraCharge
from app.models.price_matrix import PriceMatrixCell, PriceMatrixCellOption
from app.models.product import Product, ProductCategory
from app.models.quantity_slab import QuantitySlab
from app.utils.seed_helpers import get_or_create, get_or_create_option

CATEGORY = "Xerox / Photocopy"

SIZES = ["A5", "B5", "A4", "Letter", "Legal / FS", "B4", "A3", "A2", "A1", "A0"]
LARGE_FORMAT = {"A2", "A1", "A0"}  # plotter sizes: single side only

# Price per sheet by quantity band (1-50, 51-100, 101-500, 501-1000, 1000+), taken from the
# client's A4 rates already in the system; other sizes scale from these.
A4 = {
    ("Black & White", "Single Side"): [2.0, 1.5, 1.2, 1.0, 0.8],
    ("Black & White", "Double Side"): [3.0, 2.5, 2.0, 1.8, 1.5],
    ("Colour", "Single Side"): [10.0, 9.0, 8.0, 7.0, 6.0],
    ("Colour", "Double Side"): [18.0, 16.0, 14.0, 12.0, 10.0],
}
SIZE_FACTOR = {"A5": 0.75, "B5": 0.85, "A4": 1.0, "Letter": 1.0, "Legal / FS": 1.25, "B4": 1.6, "A3": 2.0}
LARGE = {  # estimates per sheet (single side)
    ("A2", "Black & White"): [20.0, 18.0, 16.0, 14.0, 12.0],
    ("A2", "Colour"): [80.0, 72.0, 64.0, 56.0, 50.0],
    ("A1", "Black & White"): [35.0, 32.0, 29.0, 26.0, 23.0],
    ("A1", "Colour"): [140.0, 126.0, 112.0, 100.0, 90.0],
    ("A0", "Black & White"): [60.0, 55.0, 50.0, 45.0, 40.0],
    ("A0", "Colour"): [240.0, 216.0, 192.0, 170.0, 150.0],
}

# Paper GSM: % added to the page rate (a 70 GSM normal sheet is the base).
GSM_CHARGES = [
    ("Paper GSM - 70 GSM (Normal)", 0.0), ("Paper GSM - 80 GSM", 10.0), ("Paper GSM - Bond Paper", 20.0),
    ("Paper GSM - 100 GSM", 25.0), ("Paper GSM - 130 GSM", 60.0), ("Paper GSM - 170 GSM", 100.0),
    ("Paper GSM - 250 GSM", 150.0), ("Paper GSM - 300 GSM", 180.0), ("Paper GSM - Photo Glossy", 120.0),
]
# (name, charge type, default amount, group). Existing rows keep their current amount.
FINISHING = [
    ("Stapling", ChargeType.per_set, 2.0, "Binding"),
    ("Comb Binding", ChargeType.per_set, 25.0, "Binding"),
    ("Spiral Binding", ChargeType.per_set, 30.0, "Binding"),
    ("Wiro Binding", ChargeType.per_set, 60.0, "Binding"),
    ("Soft Binding", ChargeType.per_set, 50.0, "Binding"),
    ("Perfect (Glue) Binding", ChargeType.per_set, 70.0, "Binding"),
    ("Hard Binding", ChargeType.per_set, 150.0, "Binding"),
    ("Transparent Front Sheet", ChargeType.per_set, 10.0, "Front Sheet"),
    ("Colour Card Front Sheet", ChargeType.per_set, 15.0, "Front Sheet"),
    ("Transparent Front + Card Back Sheet", ChargeType.per_set, 20.0, "Front Sheet"),
    ("Printed Cover Page (Colour)", ChargeType.per_set, 25.0, "Front Sheet"),
    ("Hole Punching (2 holes)", ChargeType.per_set, 2.0, "Punching"),
    ("Hole Punching (4 holes)", ChargeType.per_set, 3.0, "Punching"),
    ("Lamination (per page)", ChargeType.per_unit, 5.0, "Lamination"),
    ("Lamination - A3 (per page)", ChargeType.per_unit, 10.0, "Lamination"),
]

db = SessionLocal()


def main():
    cat = db.query(ProductCategory).filter_by(name=CATEGORY).first()
    if not cat:
        raise SystemExit(f'Category "{CATEGORY}" not found -- run seed_xerox_data.py first.')
    stats = {"sizes": 0, "cells": 0, "charges": 0, "retyped": 0}

    size_attr = db.query(Attribute).filter_by(category_id=cat.id, name="Paper Size").one()
    colour_attr = db.query(Attribute).filter_by(category_id=cat.id, name="Colour").one()
    side_attr = db.query(Attribute).filter_by(category_id=cat.id, name="Print Side").one()

    # sizes (and a sensible display order)
    size_opts = {}
    for i, name in enumerate(SIZES):
        opt, created = get_or_create_option(db, size_attr.id, name, display_order=i)
        opt.display_order = i
        size_opts[name] = opt
        stats["sizes"] += int(created)
    colour_opts = {o.value: o for o in db.query(AttributeOption).filter_by(attribute_id=colour_attr.id)}
    side_opts = {o.value: o for o in db.query(AttributeOption).filter_by(attribute_id=side_attr.id)}

    # retire the unpriced "Paper Quality" attribute (replaced by the Paper GSM charges below)
    quality = db.query(Attribute).filter_by(category_id=cat.id, name="Paper Quality").first()
    if quality:
        quality.is_active = False
        quality.in_price_matrix = False
        quality.is_required = False
        for o in db.query(AttributeOption).filter_by(attribute_id=quality.id):
            o.is_active = False

    # price grid -- create missing cells only
    slabs = db.query(QuantitySlab).filter_by(category_id=cat.id).order_by(QuantitySlab.min_quantity).all()
    product = db.query(Product).filter_by(category_id=cat.id, name="Xerox / Photocopy").one()
    existing = set()
    for cell in db.query(PriceMatrixCell).filter_by(product_id=product.id):
        existing.add((cell.quantity_slab_id, frozenset((o.attribute_id, o.attribute_option_id) for o in cell.options)))

    def add_cell(slab, size, colour, side, price):
        pairs = [(size_attr.id, size_opts[size].id), (colour_attr.id, colour_opts[colour].id), (side_attr.id, side_opts[side].id)]
        key = (slab.id, frozenset(pairs))
        if key in existing:
            return
        cell = PriceMatrixCell(product_id=product.id, quantity_slab_id=slab.id, unit_price=round(price, 2), is_active=True)
        db.add(cell)
        db.flush()
        for attr_id, opt_id in pairs:
            db.add(PriceMatrixCellOption(price_matrix_cell_id=cell.id, attribute_id=attr_id, attribute_option_id=opt_id))
        existing.add(key)
        stats["cells"] += 1

    for size in SIZES:
        for i, slab in enumerate(slabs[:5]):
            if size in LARGE_FORMAT:
                for colour in ("Black & White", "Colour"):
                    add_cell(slab, size, colour, "Single Side", LARGE[(size, colour)][i])
            else:
                for (colour, side), rates in A4.items():
                    add_cell(slab, size, colour, side, rates[i] * SIZE_FACTOR[size])

    # charges: per-set finishing, lamination, Paper GSM
    def ensure_charge(name, ctype, amount, group):
        charge, created = get_or_create(
            db, ExtraCharge, category_id=cat.id, name=name,
            defaults={"charge_type": ctype, "amount": amount, "is_active": True},
        )
        if not created and charge.charge_type == ChargeType.flat and ctype == ChargeType.per_set:
            charge.charge_type = ChargeType.per_set  # a flat per-order binding charge becomes per set
            stats["retyped"] += 1
        charge.group_name = group
        stats["charges"] += int(created)

    for name, ctype, amount, group in FINISHING:
        ensure_charge(name, ctype, amount, group)
    for name, pct in GSM_CHARGES:
        ensure_charge(name, ChargeType.percentage, pct, "Paper GSM")

    db.commit()
    print("Xerox / Photocopy completed.")
    print(f"  new paper sizes: {stats['sizes']}  |  new price cells: {stats['cells']}  |  new charges: {stats['charges']}"
          f"  |  flat binding charges made per-set: {stats['retyped']}")


if __name__ == "__main__":
    main()
