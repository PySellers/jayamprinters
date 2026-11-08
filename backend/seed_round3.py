"""
Client round 3 (Nov 2026): real price lists and the new pricing settings.

Sources: the client's printed price lists -- the Sri Jayam poster "Price List w.e.f. 01-05-2026"
(Xerox, A4 / A3 printouts, ID copies, scanning, binding) and the "ALL MEDIA - CUSTOMER RATES" sheet
(boards, papers, stickers, stickers with scoring, lamination).

What it sets up
  * Xerox / Photocopy      rates as on the poster: A4 B/W Rs.2, A3 B/W Rs.4 / Rs.7, colour Rs.12 / Rs.23 (flat, no bulk break);
                           the other sizes are scaled from those.
  * Printout               "2 to 3 prints" is Rs.10 for the lot: 2 prints = Rs.5 x 2, 3 prints = Rs.3.33 x 3.
  * Board & Paper Printing new service: 13x19 boards and papers, a "Master" rate for the 1st sheet and an
                           "Additional" rate for every further sheet (30.00 + 19.50 each ...).
  * Stickers               real rates: sticker sheets (Master / Additional) and stickers with scoring (13x19 and A4);
                           the old test items are switched off.
  * Lamination             13x19 cold (Rs.100 a board) and thermal (Rs.7.50 a board, at least Rs.150 = 20 boards).
  * Visiting Card          minimum order 50, and the extras become required dropdowns (None / option / Custom).
  * Printing charge        every "per block" service is moved to the new band table (same prices); Bill Books count
                           every printed copy of a set: up to 1,000 pages Rs.500, then Rs.500 for each further 1,000.

Safe to re-run. Rates taken from the posters are set to the poster value every time it runs, so run it once
and change prices afterwards in Pricing Setup.

Usage:
    cd backend && venv\\Scripts\\activate && python seed_round3.py
"""

from app.core.database import SessionLocal
from app.models.attribute import Attribute, AttributeOption
from app.models.company import HsnCode
from app.models.extra_charge import ChargeType, ExtraCharge
from app.models.price_matrix import PriceMatrixCell, PriceMatrixCellOption
from app.models.print_charge import PrintChargeBand
from app.models.product import Product, ProductCategory, ProductPricingType
from app.models.quantity_slab import QuantitySlab
from app.utils.seed_helpers import get_or_create, get_or_create_option, get_or_create_slab

db = SessionLocal()
done = {"cells": 0, "updated": 0, "charges": 0, "products": 0}


# ---- helpers ------------------------------------------------------------------------------------------------
def category(name, hsn_code=None):
    cat, _ = get_or_create(db, ProductCategory, name=name, defaults={"is_active": True})
    if hsn_code and cat.hsn_id is None:
        hsn = db.query(HsnCode).filter_by(code=hsn_code).first()
        if hsn:
            cat.hsn_id = hsn.id
    return cat


def attribute(cat, name, options, order, required=True):
    attr, _ = get_or_create(db, Attribute, category_id=cat.id, name=name,
                            defaults={"is_required": required, "display_order": order, "in_price_matrix": True})
    attr.is_active = True
    opts = {}
    for i, value in enumerate(options):
        opt, _ = get_or_create_option(db, attr.id, value, display_order=i)
        opt.is_active = True
        opts[value] = opt
    return attr, opts


def product(cat, name, description):
    prod, created = get_or_create(db, Product, category_id=cat.id, name=name,
                                  defaults={"description": description, "pricing_type": ProductPricingType.matrix, "is_active": True})
    prod.is_active = True
    prod.description = description
    done["products"] += int(created)
    return prod


def set_cell(prod, slab, pairs, price):
    """Creates the cell, or sets its price to `price`."""
    wanted = set(pairs)
    for cell in db.query(PriceMatrixCell).filter_by(product_id=prod.id, quantity_slab_id=slab.id).all():
        if {(o.attribute_id, o.attribute_option_id) for o in cell.options} == wanted:
            if abs(cell.unit_price - price) > 1e-9 or not cell.is_active:
                cell.unit_price = price
                cell.is_active = True
                done["updated"] += 1
            return cell
    cell = PriceMatrixCell(product_id=prod.id, quantity_slab_id=slab.id, unit_price=price, is_active=True)
    db.add(cell)
    db.flush()
    for attribute_id, option_id in pairs:
        db.add(PriceMatrixCellOption(price_matrix_cell_id=cell.id, attribute_id=attribute_id, attribute_option_id=option_id))
    done["cells"] += 1
    return cell


def charge(cat, name, ctype, amount, group=None, min_amount=None):
    row, created = get_or_create(db, ExtraCharge, category_id=cat.id, name=name,
                                 defaults={"charge_type": ctype, "amount": amount, "is_active": True})
    row.charge_type, row.amount, row.group_name, row.min_amount, row.is_active = ctype, amount, group, min_amount, True
    done["charges"] += int(created)
    return row


def slab(cat, lo, hi, label, order, incremental=False):
    row, _ = get_or_create_slab(db, cat.id, lo, hi, label, order)
    row.label, row.is_incremental = label, incremental
    return row


# ---- 1. Xerox / Photocopy ------------------------------------------------------------------------------------
def xerox():
    cat = db.query(ProductCategory).filter_by(name="Xerox / Photocopy").first()
    if not cat:
        return
    prod = db.query(Product).filter_by(category_id=cat.id, name="Xerox / Photocopy").first()
    size_attr = db.query(Attribute).filter_by(category_id=cat.id, name="Paper Size").one()
    colour_attr = db.query(Attribute).filter_by(category_id=cat.id, name="Colour").one()
    side_attr = db.query(Attribute).filter_by(category_id=cat.id, name="Print Side").one()
    size = {o.value: o for o in db.query(AttributeOption).filter_by(attribute_id=size_attr.id)}
    colour = {o.value: o for o in db.query(AttributeOption).filter_by(attribute_id=colour_attr.id)}
    side = {o.value: o for o in db.query(AttributeOption).filter_by(attribute_id=side_attr.id)}

    a4 = {("Black & White", "Single Side"): 2.00, ("Black & White", "Double Side"): 3.50,
          ("Colour", "Single Side"): 12.00, ("Colour", "Double Side"): 23.00}
    a3 = {("Black & White", "Single Side"): 4.00, ("Black & White", "Double Side"): 7.00,
          ("Colour", "Single Side"): 12.00, ("Colour", "Double Side"): 23.00}
    factor = {"A5": 0.75, "B5": 0.85, "A4": 1.0, "Letter": 1.0, "Legal / FS": 1.25}
    slabs = db.query(QuantitySlab).filter_by(category_id=cat.id, is_incremental=False).order_by(QuantitySlab.min_quantity).all()
    slabs = [s for s in slabs if s.min_quantity in (1, 51, 101, 501, 1001)]

    def rate(sz, col, sd):
        if sz == "A3" or sz == "B4":
            return a3[(col, sd)]
        return round(a4[(col, sd)] * factor[sz] * 4) / 4

    for sz in ["A5", "B5", "A4", "Letter", "Legal / FS", "B4", "A3"]:
        for (col, sd) in a4:
            for s in slabs:
                set_cell(prod, s, [(size_attr.id, size[sz].id), (colour_attr.id, colour[col].id), (side_attr.id, side[sd].id)], rate(sz, col, sd))
    prod.description = "Xerox copies - rates from the shop's price list (A4 B/W Rs.2). Choose paper size, colour and sides."


# ---- 2. Printout: "2 to 3 prints" is Rs.10 for the lot ---------------------------------------------------------
def printout():
    cat = db.query(ProductCategory).filter_by(name="Printout").first()
    if not cat:
        return
    prod = db.query(Product).filter_by(category_id=cat.id, name="A4 B/W Laser Printout").first()
    side_attr = db.query(Attribute).filter_by(category_id=cat.id, name="Print Side").one()
    side = {o.value: o for o in db.query(AttributeOption).filter_by(attribute_id=side_attr.id)}
    two = db.query(QuantitySlab).filter_by(category_id=cat.id, min_quantity=2, max_quantity=3).first()
    if two:
        two.max_quantity, two.label = 2, "2 prints"
    else:
        two = slab(cat, 2, 2, "2 prints", 11)
    three = slab(cat, 3, 3, "3 prints", 12)
    for sd in ("One Side", "Front & Back"):
        set_cell(prod, two, [(side_attr.id, side[sd].id)], 5.00)          # Rs.10 for 2 prints
        set_cell(prod, three, [(side_attr.id, side[sd].id)], round(10 / 3, 4))  # Rs.10 for 3 prints
    db.flush()


# ---- 3 & 4. Board & Paper Printing, Stickers, Lamination ---------------------------------------------------------
BOARDS = [  # (name, master (1st sheet), additional (each further sheet))
    ("300 GSM Art / Matt Board", 30.00, 19.50), ("130 GSM Art Paper", 30.00, 16.50), ("170 GSM Art Paper", 30.00, 16.50),
    ("12x18 - 180 PC", 35.00, 20.00), ("Synthetic Board", 60.00, 40.00),
    ("300 GSM Metallic Gold", 60.00, 40.00), ("300 GSM Metallic Silver", 60.00, 40.00),
    ("300 GSM Metallic Texture", 60.00, 40.00), ("300 GSM Texture", 60.00, 40.00),
    ("300 GSM Needle Point", 60.00, 40.00), ("300 GSM Criss-Cross", 60.00, 40.00),
    ("300 GSM Yellow Board", 30.00, 19.50), ("12x18 Yellow Invitation 130 GSM", 30.00, 16.50),
    ("12x17 100 GSM Bond Paper", 20.00, 20.00), ("12x18 100 GSM Paper", 20.00, 12.00),
    ("A3 Colour Print", 20.00, 20.00),
]
STICKERS = [  # (type, master, additional, with scoring 13x19, with scoring A4)
    ("Normal Sticker", 30.00, 21.00, 105.00, 70.00),
    ("Synthetic Sticker", 90.00, 70.00, 155.00, 90.00),
    ("Transparent / Clear Sticker", 90.00, 70.00, 155.00, 90.00),
    ("Silver Sticker", 90.00, 70.00, 175.00, 100.00),
    ("Gold Sticker", 90.00, 70.00, 175.00, 100.00),
]


def lamination(cat):
    charge(cat, "Cold Lamination 13x19 Matt / Glossy (per board)", ChargeType.per_unit, 100.0, group="Lamination")
    charge(cat, "Thermal Lamination 13x19 (per board, at least Rs.150)", ChargeType.per_unit, 7.5, group="Lamination", min_amount=150.0)


def boards():
    cat = category("Board & Paper Printing (13x19)", "4911")
    cat.min_charge = None
    attr, opts = attribute(cat, "Board / Paper", [b[0] for b in BOARDS], 1)
    master = slab(cat, 1, 1, "1st sheet (Master)", 1, incremental=True)
    additional = slab(cat, 2, None, "Every further sheet (Additional)", 2, incremental=True)
    prod = product(cat, "Board / Paper Printing 13x19", "Price per sheet: the 1st sheet is the Master rate, every further sheet the Additional rate")
    for name, m, a in BOARDS:
        set_cell(prod, master, [(attr.id, opts[name].id)], m)
        set_cell(prod, additional, [(attr.id, opts[name].id)], a)
    lamination(cat)
    charge(cat, "Design charge", ChargeType.flat, 150.0, group="Design")


def stickers():
    cat = category("Stickers", "4911")
    cat.min_charge = None
    attr, opts = attribute(cat, "Sticker Type", [s[0] for s in STICKERS], 1)
    master = slab(cat, 1, 1, "1st sheet (Master)", 20, incremental=True)
    additional = slab(cat, 2, None, "Every further sheet (Additional)", 21, incremental=True)
    anyqty = slab(cat, 1, None, "Any quantity (per sheet)", 22)
    sheet = product(cat, "Sticker Sheet 13x19", "13x19 sticker sheets: the 1st sheet is the Master rate, every further sheet the Additional rate")
    sc13 = product(cat, "Sticker with Scoring 13x19", "13x19 sticker sheet with scoring (cut lines) - rate per sheet")
    sca4 = product(cat, "Sticker with Scoring A4", "A4 sticker sheet with scoring (cut lines) - rate per sheet")
    for name, m, a, s13, s4 in STICKERS:
        set_cell(sheet, master, [(attr.id, opts[name].id)], m)
        set_cell(sheet, additional, [(attr.id, opts[name].id)], a)
        set_cell(sc13, anyqty, [(attr.id, opts[name].id)], s13)
        set_cell(sca4, anyqty, [(attr.id, opts[name].id)], s4)
    # the earlier TEST items (made-up rates) are switched off; old orders keep their records
    for old in db.query(Product).filter(Product.category_id == cat.id, Product.name.in_(["Sticker - by size (per sq ft)", "Sticker Sheet (A4)"])):
        old.is_active = False
    legacy = db.query(Attribute).filter_by(category_id=cat.id, name="Sticker Material").first()
    if legacy:
        legacy.is_active, legacy.is_required, legacy.in_price_matrix = False, False, False
    lamination(cat)


# ---- 5. Visiting card ------------------------------------------------------------------------------------------
def visiting_card():
    cat = db.query(ProductCategory).filter_by(name="Visiting Card").first()
    if not cat:
        return
    for prod in db.query(Product).filter_by(category_id=cat.id):
        prod.min_quantity = 50
    groups = {
        "Designing Charge": "Design", "Logo Designing Charge": "Design",
        "Corner Cutting - Two Corner": "Corner cutting", "Corner Cutting - Four Corner": "Corner cutting",
        "Foiling - Gold": "Foiling", "Foiling - Silver": "Foiling",
    }
    for name, group in groups.items():
        row = db.query(ExtraCharge).filter_by(category_id=cat.id, name=name).first()
        if row:
            row.group_name = group
    cat.extras_required = True


# ---- 6. Printing-charge bands ---------------------------------------------------------------------------------
def bands(cat, rows):
    db.query(PrintChargeBand).filter(PrintChargeBand.category_id == cat.id).delete()
    for lo, hi, amount, per_block, block in rows:
        db.add(PrintChargeBand(category_id=cat.id, min_quantity=lo, max_quantity=hi, amount=amount, per_block=per_block, block_size=block))
    cat.print_charge_mode = "slab"


def printing_bands():
    for cat in db.query(ProductCategory).filter(ProductCategory.print_charge_mode == "block"):
        size, rate = cat.print_block_size, cat.print_block_rate
        if cat.name == "Bill Books & Stationery":
            continue
        if size and rate:  # same prices as before: Rs.rate for the first block, Rs.rate for every further block
            bands(cat, [(1, size, rate, False, None), (size + 1, None, rate, True, size)])
    bill = db.query(ProductCategory).filter_by(name="Bill Books & Stationery").first()
    if bill:
        bands(bill, [(1, 1000, 500.0, False, None), (1001, None, 500.0, True, 1000)])
        bill.print_per_layer = True  # the pages printed = copies x leaves
        bill.print_block_size = bill.print_block_rate = None


def main():
    xerox()
    printout()
    boards()
    stickers()
    visiting_card()
    printing_bands()
    db.commit()
    print("Round 3 pricing ready:", done)


if __name__ == "__main__":
    main()
