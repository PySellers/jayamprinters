"""
Default Chennai-market rates for "Bill Books & Stationery" (client request, Oct 2026).

These are STARTING rates so the order screen shows realistic amounts end to end.
The client edits the real ones later in Pricing Setup (extra charges, option prices)
and Price Matrix (per size x paper x quantity-slab rates). Safe to re-run: by default
only values that are still Rs.0 are filled, so anything already edited by hand is
left alone. Pass --force to overwrite everything with these defaults.

How the money works (Quantity on the order = number of SETS, i.e. printed leaves of
the Original; e.g. 100 books x 50 sets = 5000):
  Matrix rate (per set)   = paper + press running + job set-up, by size x paper/GSM x slab
                            (the slab rate applies to the whole quantity, so the
                            "Add. 1000 Nos" slab is cheaper per set - set-up is spread out)
  + Copies per Set        = extra plain leaf per extra copy            (per set, option price)
  + Paper Name            = brand premium over the standard maplitho   (per set, option price)
  + Print Side            = back-side printing                         (per set, option price)
  + Bill Type             = carbonless (NCR) premium, % of the above
  + Binding Type / Model  = typical 50-set book cost spread per set
  + Binding Set           = labour for that set size and copies count  (per set)

Paper Colour is not priced: the order screen records the colour of each copy as a
note only. Rates are market estimates, not quotes - confirm with the paper/plate
suppliers before relying on them.

Usage:
    cd backend && venv\\Scripts\\activate && python seed_bill_book_prices.py [--force] [--dry-run]
"""

import sys

from app.core.database import SessionLocal
from app.models.product import ProductCategory, Product
from app.models.attribute import Attribute, AttributeOption
from app.models.quantity_slab import QuantitySlab
from app.models.price_matrix import PriceMatrixCell
from app.models.extra_charge import ExtraCharge, ChargeType

CATEGORY_NAME = "Bill Books & Stationery"
FORCE = "--force" in sys.argv
DRY_RUN = "--dry-run" in sys.argv

# ---- paper: Rs. per full sheet (23x36 in), Chennai wholesale, Oct 2026 ----------
SHEET_COST = {
    "54 GSM": 5.6, "60 GSM": 6.2, "70 GSM": 7.2, "80 GSM": 8.2,
    "85 GSM": 8.7, "90 GSM": 9.3, "100 GSM": 10.3, "120 GSM": 12.4,
    "Royal Ex.Bond 70": 10.5, "Royal Ex.Bond 80": 12.0, "Royal Ex.Bond 90": 13.5, "Royal Ex.Bond 100": 15.0,
    "Ledger 80": 13.0, "Ledger 90": 14.5, "Ledger 100": 16.0,
}
# leaves obtained from one full sheet (the size name is a fraction of the sheet)
LEAVES_PER_SHEET = {
    "1/3": 3, "1/4": 4, "1/5": 5, "1/6": 6, "1/6 Length": 6, "1/8": 8, "1/8 Length": 8,
    "1/10": 10, "1/12": 12, "1/16": 16, "1/24": 24, "A3": 3.5,
}
WASTAGE = 1.08            # 8% paper wastage / make-ready sheets
RUN_PER_SHEET = 0.35      # ink, wash-up, machine time per sheet impression
SETUP = 700.0             # plate + make-ready + labour per job
SLAB_AVG_QTY = {1: 800, 1001: 3000}   # typical order size per slab, to spread the set-up cost

COPY_EXTRA = 0.60         # per extra copy, per set (plain leaf; size-independent average)
PAPER_NAME_EXTRA = {
    "Royal Ex.Bond": 0.10, "Excel Bond": 0.00, "Palarpur": 0.00, "Westcost": 0.05, "Sheshai": 0.08,
    "Sirpur": 0.05, "Seshai Ledger": 0.30, "Sirpur Ledger": 0.25, "Westcos Ledger": 0.25,
    "Foreign Paper": 0.40, "Custom": 0.00,
}
PRINT_SIDE_EXTRA = {"Single Side": 0.00, "Front Back": 0.30}
BILL_TYPE_PERCENT = {
    "Single Bill": 0, "Two Bill (NCR)": 10, "Three Bill (NCR)": 14,
    "Four Bill (NCR)": 18, "Six Bill (NCR)": 24, "Eight Bill (NCR)": 30,
}
# Rs. per book for a typical 50-set book, converted to Rs. per set (/50)
BINDING_TYPE_PER_BOOK = {"Loose Sheet": 0.0, "Pad": 8.0, "Soft Binding": 15.0, "Hard Binding": 40.0, "Custom": 0.0}
BINDING_MODEL_PER_BOOK = {"Top Binding": 0.0, "Side Binding": 2.0, "Bottom Binding": 1.0, "Center Stitching": 4.0}
BINDING_SET_SIZES = {"25 Set": 25, "50 Set": 50, "100 Set": 100, "200 Set": 200}   # "Custom" stays Rs.0
BINDING_SET_FIXED_PER_BOOK = 3.0
BINDING_SET_PER_LEAF = 0.035


def nearest(x, step=0.05):
    return max(step, round(round(x / step) * step, 2))


def matrix_rate(gsm_label, size, slab_min):
    leaves = LEAVES_PER_SHEET[size]
    paper = SHEET_COST[gsm_label] / leaves * WASTAGE
    return nearest(paper + RUN_PER_SHEET / leaves + SETUP / SLAB_AVG_QTY[slab_min])


stats = {"cells": 0, "options": 0, "charges": 0, "kept": 0}


def set_value(obj, field, new, label=None):
    """Fill only values still at 0 (never clobber a hand-edited price) unless --force."""
    current = getattr(obj, field) or 0
    if current and not FORCE:
        stats["kept"] += 1
        return False
    if current != new:
        setattr(obj, field, new)
    return True


def main():
    db = SessionLocal()
    category = db.query(ProductCategory).filter_by(name=CATEGORY_NAME).first()
    if not category:
        raise SystemExit(f'Category "{CATEGORY_NAME}" not found -- run seed_bill_books.py first.')

    # ---- 1. price matrix: size x paper/GSM x quantity slab -------------------------
    gsm_attr = db.query(Attribute).filter_by(category_id=category.id, name="Paper/GSM Type").one()
    gsm_by_id = {o.id: o.value for o in gsm_attr.options}
    slabs = {s.id: s for s in db.query(QuantitySlab).filter_by(category_id=category.id)}
    products = {p.id: p for p in db.query(Product).filter_by(category_id=category.id)}
    cells = db.query(PriceMatrixCell).filter(PriceMatrixCell.product_id.in_(products.keys())).all()
    for cell in cells:
        size = products[cell.product_id].name.replace("Sheet Printing - ", "")
        gsm_opt = next((o for o in cell.options if o.attribute_id == gsm_attr.id), None)
        if size not in LEAVES_PER_SHEET or gsm_opt is None or gsm_by_id.get(gsm_opt.attribute_option_id) not in SHEET_COST:
            continue
        rate = matrix_rate(gsm_by_id[gsm_opt.attribute_option_id], size, slabs[cell.quantity_slab_id].min_quantity)
        stats["cells"] += set_value(cell, "unit_price", rate)

    # ---- 2. option prices (added to every set) ------------------------------------
    def price_options(attr_name, table):
        attr = db.query(Attribute).filter_by(category_id=category.id, name=attr_name).one()
        for opt in attr.options:
            if opt.value in table:
                stats["options"] += set_value(opt, "extra_price", table[opt.value])

    price_options("Paper Name", PAPER_NAME_EXTRA)
    price_options("Print Side", PRINT_SIDE_EXTRA)
    price_options("Copies per Set", {f"1+{n}": round(COPY_EXTRA * n, 2) for n in range(1, 7)})

    # ---- 3. extra charges -----------------------------------------------------------
    charges = {c.name: c for c in db.query(ExtraCharge).filter_by(category_id=category.id)}

    def price_charge(name, charge_type, amount):
        charge = charges.get(name)
        if charge is None:
            return
        if set_value(charge, "amount", amount):
            charge.charge_type = charge_type
            stats["charges"] += 1

    for label, pct in BILL_TYPE_PERCENT.items():
        price_charge(f"Bill Type - {label}", ChargeType.percentage, float(pct))
    for label, per_book in BINDING_TYPE_PER_BOOK.items():
        price_charge(f"Binding - {label}", ChargeType.per_unit, round(per_book / 50, 2))
    for label, per_book in BINDING_MODEL_PER_BOOK.items():
        price_charge(f"Binding Model - {label}", ChargeType.per_unit, round(per_book / 50, 2))
    for label, set_size in BINDING_SET_SIZES.items():
        for n in range(1, 7):
            layers = 1 + n
            per_set = round(BINDING_SET_FIXED_PER_BOOK / set_size + BINDING_SET_PER_LEAF * layers, 2)
            price_charge(f"Binding Set - {label} (1+{n})", ChargeType.per_unit, per_set)

    if DRY_RUN:
        db.rollback()
    else:
        db.commit()
    print(("DRY RUN - nothing saved. " if DRY_RUN else "") + "Bill Book default rates applied:")
    print(f"  price-matrix cells : {stats['cells']}")
    print(f"  option prices      : {stats['options']}")
    print(f"  extra charges      : {stats['charges']}")
    if stats["kept"]:
        print(f"  left untouched (already priced by hand): {stats['kept']}  (use --force to overwrite)")


if __name__ == "__main__":
    main()
