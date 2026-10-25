"""
New services requested by the client (Oct 2026): "Printout" and "Stickers".

PRINTOUT follows the client's own price list ("Xerox options.jpeg", price list w.e.f. 01-05-2026):
  * A4 B/W laser printout - rate per page by number of pages, one side / front & back
  * A4 colour laser printout - normal / semi-solid / full-solid colours, mirror board, art board
  * A3 xerox / printout (B/W and colour)
  * ID-size copies (Aadhaar / DL / RC)
  * scanning (up to A3) by number of pages
  * extra for executive bond paper, and Spiral / Comb (Wire-O) / Soft binding by thickness

Reading of the list used here (confirm with the client): the "2-3 print" row is treated as the same rate as the first
print (the price list prints Rs.10 against it), then "2 to 25" starts at 4 pages.

STICKERS has no client price list yet, so its rates are TEST figures (marked in the item description).

Safe to re-run: only missing rows are created, existing prices are never overwritten.

Usage:
    cd backend && venv\\Scripts\\activate && python seed_printout_stickers.py
"""

from app.core.database import SessionLocal
from app.models.attribute import Attribute
from app.models.company import HsnCode
from app.models.extra_charge import ChargeType, ExtraCharge
from app.models.price_matrix import PriceMatrixCell, PriceMatrixCellOption
from app.models.product import Product, ProductCategory, ProductPricingType
from app.utils.seed_helpers import get_or_create, get_or_create_option, get_or_create_slab

db = SessionLocal()
made = {"cells": 0, "charges": 0, "products": 0}


def ensure_attribute(category, name, options, order, required=False, in_matrix=True):
    attr, _ = get_or_create(db, Attribute, category_id=category.id, name=name,
                            defaults={"is_required": required, "display_order": order, "in_price_matrix": in_matrix})
    return attr, {v: get_or_create_option(db, attr.id, v, display_order=i)[0] for i, v in enumerate(options)}


def ensure_product(category, name, description=None, pricing_type=ProductPricingType.matrix):
    product, created = get_or_create(db, Product, category_id=category.id, name=name,
                                     defaults={"description": description, "pricing_type": pricing_type, "is_active": True})
    made["products"] += int(created)
    return product


def ensure_cell(product, slab, pairs, price):
    """Creates the price cell if it is missing; a price someone already changed is left alone."""
    wanted = set(pairs)
    for cell in db.query(PriceMatrixCell).filter_by(product_id=product.id, quantity_slab_id=slab.id).all():
        if {(o.attribute_id, o.attribute_option_id) for o in cell.options} == wanted:
            return
    cell = PriceMatrixCell(product_id=product.id, quantity_slab_id=slab.id, unit_price=price, is_active=True)
    db.add(cell)
    db.flush()
    for attribute_id, option_id in pairs:
        db.add(PriceMatrixCellOption(price_matrix_cell_id=cell.id, attribute_id=attribute_id, attribute_option_id=option_id))
    made["cells"] += 1


def ensure_charge(category, name, charge_type, amount, group=None):
    existing = db.query(ExtraCharge).filter_by(category_id=category.id, name=name).first()
    if existing:
        return
    db.add(ExtraCharge(category_id=category.id, name=name, charge_type=charge_type, amount=amount, is_active=True, group_name=group))
    made["charges"] += 1


def category(name, hsn_code, min_charge=None):
    cat, _ = get_or_create(db, ProductCategory, name=name, defaults={"is_active": True})
    hsn = db.query(HsnCode).filter_by(code=hsn_code).first()
    if hsn and cat.hsn_id is None:
        cat.hsn_id = hsn.id
    if min_charge and cat.min_charge is None:
        cat.min_charge = min_charge
    return cat


# ------------------------------------------------------------------------------------------------------ PRINTOUT
def seed_printout():
    cat = category("Printout", "998912")
    side_attr, side = ensure_attribute(cat, "Print Side", ["One Side", "Front & Back"], 1, required=True)
    colour_attr, colour = ensure_attribute(cat, "Colour / Paper Type", ["Normal Colour", "Semi Solid Colours", "Full Solid Colours", "Mirror Board", "Art Board 225-300"], 2)
    a3_attr, a3 = ensure_attribute(cat, "A3 Type", ["BW Xerox", "BW Printout", "Colour Xerox"], 3)
    id_attr, idt = ensure_attribute(cat, "ID Size Type", ["ID Colour Xerox", "ID BW Xerox"], 4)

    # --- A4 B/W laser printout: price per page by number of pages (one side, front & back) ---
    bw = ensure_product(cat, "A4 B/W Laser Printout", "A4 black & white laser printout - rate per page by number of pages")
    tiers = [  # (from, to, one side, front & back)
        (1, 1, 5.00, None), (2, 3, 5.00, 5.00), (4, 25, 2.00, 1.90), (26, 100, 1.90, 1.75), (101, 200, 1.75, 1.65),
        (201, 300, 1.65, 1.55), (301, 400, 1.55, 1.40), (401, 500, 1.40, 1.25), (501, None, 1.25, 1.00),
    ]
    for order, (lo, hi, one, both) in enumerate(tiers):
        label = f"{lo}" if lo == hi else (f"{lo} to {hi}" if hi else f"{lo} and above")
        slab, _ = get_or_create_slab(db, cat.id, lo, hi, f"{label} pages", 10 + order)
        ensure_cell(bw, slab, [(side_attr.id, side["One Side"].id)], one)
        if both is not None:
            ensure_cell(bw, slab, [(side_attr.id, side["Front & Back"].id)], both)

    # --- single-rate items (any number of pages) ---
    flat, _ = get_or_create_slab(db, cat.id, 1, None, "Any number of pages", 1)
    colour_a4 = ensure_product(cat, "A4 Colour Laser Printout", "A4 colour laser printout - rate per page")
    for name, one, both in [("Normal Colour", 12.0, 23.0), ("Semi Solid Colours", 15.0, 29.0), ("Full Solid Colours", 18.0, 35.0),
                            ("Mirror Board", 20.0, None), ("Art Board 225-300", 17.0, 30.0)]:
        ensure_cell(colour_a4, flat, [(colour_attr.id, colour[name].id), (side_attr.id, side["One Side"].id)], one)
        if both is not None:
            ensure_cell(colour_a4, flat, [(colour_attr.id, colour[name].id), (side_attr.id, side["Front & Back"].id)], both)
    a3_item = ensure_product(cat, "A3 Xerox / Printout", "A3 xerox and printout, black & white or colour - rate per page")
    for name, one, both in [("BW Xerox", 4.0, 7.0), ("BW Printout", 7.0, 13.0), ("Colour Xerox", 12.0, 23.0)]:
        ensure_cell(a3_item, flat, [(a3_attr.id, a3[name].id), (side_attr.id, side["One Side"].id)], one)
        ensure_cell(a3_item, flat, [(a3_attr.id, a3[name].id), (side_attr.id, side["Front & Back"].id)], both)
    id_item = ensure_product(cat, "ID Size Copy (Aadhaar / DL / RC)", "Aadhaar, driving licence, RC and any ID-size copy - choose Front & Back")
    for name, both in [("ID Colour Xerox", 15.0), ("ID BW Xerox", 4.0)]:
        ensure_cell(id_item, flat, [(id_attr.id, idt[name].id), (side_attr.id, side["Front & Back"].id)], both)

    # --- scanning up to A3 (the Print Side choice is not used: choose One Side) ---
    scan = ensure_product(cat, "Scanning (up to A3)", "Scanning per page, up to A3 size - choose One Side")
    for order, (lo, hi, rate) in enumerate([(1, 10, 10.0), (11, 25, 8.0), (26, None, 7.0)]):
        label = f"{lo} to {hi}" if hi else f"{lo} and above"
        slab, _ = get_or_create_slab(db, cat.id, lo, hi, f"Scan {label} pages", 30 + order)
        ensure_cell(scan, slab, [(side_attr.id, side["One Side"].id)], rate)

    # --- extras ---
    ensure_charge(cat, "Executive Bond paper (extra per sheet)", ChargeType.per_unit, 1.50)
    for kind, base, group in [("Spiral Binding", 50.0, "Spiral Binding"), ("Comb / Wire-O Binding", 75.0, "Comb / Wire-O Binding"), ("Soft Binding", 50.0, "Soft Binding")]:
        # A4: the first 5 mm costs the base rate, every further 2.5 mm adds Rs.10 (per bound copy of the document)
        for step, mm in enumerate([5, 7.5, 10, 12.5, 15, 17.5, 20, 25]):
            ensure_charge(cat, f"{kind} - A4 up to {mm:g} mm", ChargeType.per_set, base + 10.0 * step, group="Binding")
    ensure_charge(cat, "Lamination (per page)", ChargeType.per_unit, 5.0)


# ------------------------------------------------------------------------------------------------------ STICKERS
def seed_stickers():
    cat = category("Stickers", "4911", min_charge=100.0)
    material_attr, material = ensure_attribute(cat, "Sticker Material", ["Paper Sticker", "Vinyl Sticker", "Transparent Vinyl", "Reflective"], 1, required=True)
    small, _ = get_or_create_slab(db, cat.id, 1, 9, "1 to 9", 1)
    mid, _ = get_or_create_slab(db, cat.id, 10, 99, "10 to 99", 2)
    big, _ = get_or_create_slab(db, cat.id, 100, None, "100 and above", 3)

    by_area = ensure_product(cat, "Sticker - by size (per sq ft)", "TEST rates: enter the width and height of one sticker (ft); price is per sq ft", ProductPricingType.per_area)
    for name, rates in {"Paper Sticker": (18.0, 16.0, 14.0), "Vinyl Sticker": (35.0, 30.0, 26.0), "Transparent Vinyl": (42.0, 36.0, 32.0), "Reflective": (85.0, 75.0, 65.0)}.items():
        for slab, rate in zip((small, mid, big), rates):
            ensure_cell(by_area, slab, [(material_attr.id, material[name].id)], rate)

    sheet = ensure_product(cat, "Sticker Sheet (A4)", "TEST rates: A4 sticker sheet, price per sheet")
    for name, rates in {"Paper Sticker": (25.0, 22.0, 18.0), "Vinyl Sticker": (45.0, 40.0, 35.0), "Transparent Vinyl": (55.0, 50.0, 45.0)}.items():
        for slab, rate in zip((small, mid, big), rates):
            ensure_cell(sheet, slab, [(material_attr.id, material[name].id)], rate)

    ensure_charge(cat, "Die Cut (per sticker)", ChargeType.per_unit, 2.0, group="Cutting")
    ensure_charge(cat, "Kiss / Half Cut (per sticker)", ChargeType.per_unit, 1.0, group="Cutting")
    ensure_charge(cat, "Lamination - Matt / Gloss", ChargeType.percentage, 10.0)
    ensure_charge(cat, "Design charge", ChargeType.flat, 150.0)


def main():
    seed_printout()
    seed_stickers()
    db.commit()
    print(f"Printout and Stickers services ready: {made['products']} items, {made['cells']} price cells, {made['charges']} extra charges added.")


if __name__ == "__main__":
    main()
