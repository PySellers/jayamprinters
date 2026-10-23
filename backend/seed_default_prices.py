"""
Fills every price that is still Rs.0 with a sensible default for the Chennai market, so each
service can be tested end to end (price -> invoice -> job card). Bill Books and Xerox are
priced by their own scripts; this covers the other services plus the unpriced rubber stamps.

SAFE TO RE-RUN: it only touches entries that are still exactly 0 (price-matrix cells, fixed
prices, extra charges). Anything the client has already entered is left alone.

These are ESTIMATES for UAT/demo, built from simple cost logic (paper area, GSM, quantity
discounts, finishing add-ons) -- the client replaces them with real rates in Pricing Setup.

Usage:
    cd backend && venv\\Scripts\\activate && python seed_default_prices.py
"""

import math
import re

from app.core.database import SessionLocal
from app.models.extra_charge import ChargeType, ExtraCharge
from app.models.price_matrix import PriceMatrixCell
from app.models.product import Product, ProductCategory
from app.models.quantity_slab import QuantitySlab

db = SessionLocal()
FLAT, UNIT, SQFT, PCT = ChargeType.flat, ChargeType.per_unit, ChargeType.per_sqft, ChargeType.percentage


# ---------------------------------------------------------------- helpers
def area_sq_in(text: str, default: float = 80.0) -> float:
    """Paper area in square inches from labels such as '15x20', '7.5x5.5', 'A4', '11.5x18 (A3)'."""
    m = re.search(r"(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)", text)
    if m:
        return float(m.group(1)) * float(m.group(2))
    a = re.search(r"\bA(\d)\b", text)
    if a:
        return {"3": 193.0, "4": 96.7, "5": 48.4}.get(a.group(1), default)
    return default


def gsm(text: str, default: int = 80) -> int:
    m = re.search(r"(\d{2,3})\s*GSM", text)
    return int(m.group(1)) if m else default


def paper_factor(label: str) -> float:
    """Cost factor for 'Maplitho 80 GSM' / 'Art Paper 130 GSM' style labels (80 GSM maplitho = 1.0)."""
    g = gsm(label)
    if label.lower().startswith("art"):
        return round(1.0 + (g - 80) / 220 * 1.5, 3)
    return round(0.85 + (g - 54) / 66 * 0.45, 3)


def nice(value: float) -> float:
    return round(value, 3)


def cells_for(category: ProductCategory):
    """(cell, product, options{attr: value}, slab) for every zero-priced matrix cell of the category."""
    rows = []
    slabs = {s.id: s for s in db.query(QuantitySlab).filter_by(category_id=category.id)}
    for product in db.query(Product).filter_by(category_id=category.id):
        for cell in db.query(PriceMatrixCell).filter_by(product_id=product.id):
            if cell.unit_price:
                continue
            opts = {o.attribute.name: o.attribute_option.value for o in cell.options}
            rows.append((cell, product, opts, slabs[cell.quantity_slab_id]))
    return rows


def slab_index(slab: QuantitySlab, starts) -> int:
    return max(i for i, s in enumerate(starts) if slab.min_quantity >= s)


# ---------------------------------------------------------------- per-service pricing (price per unit)
def price_invitation(product, opts, slab):
    base = {
        "Wedding Invitation - Offset": [9.0, 7.0, 5.5], "Wedding Invitation - Screen Print": [14.0, 12.0, 10.0],
        "Multicolor Card": [6.5, 5.0, 4.0], "Color Board": [7.5, 6.0, 4.8], "Redymade Invitation": [18.0, 15.0, 13.0],
    }[product.name][slab_index(slab, [1, 501, 1001])]
    mat = {"Maplitho Paper": 0.8, "Art Paper": 0.9, "Art Board": 1.0, "Duplex Paper": 0.85, "Duplex Board": 0.95,
           "Metallic Board": 1.4, "Laminated Board": 1.25}.get(opts.get("Paper/Board Type", ""), 1.0)
    side = {"Single Side": 1.0, "Both Side": 1.4}.get(opts.get("Side", ""), 1.0)
    return base * mat * side


def price_book_cover(product, opts, slab):
    mat = {"Maplitho Paper": 0.8, "Art Paper": 0.9, "Art Board": 1.0, "Duplex Paper": 0.85, "Duplex Board": 0.95,
           "Metallic Board": 1.4, "Brown Paper": 0.7}.get(opts.get("Paper/Board Type", ""), 1.0)
    if "Cover Size" in opts:
        base = 2.0 + 0.075 * area_sq_in(opts["Cover Size"], 60.0)
    else:
        base = 6.5 if slab.min_quantity == 1 else 5.0
    label = slab.label or ""
    mode = 1.7 if "Screen" in label else 2.3 if "Digital" in label else 0.85 if slab.min_quantity == 501 else 1.0
    return base * mat * (mode if "Cover Size" in opts else 1.0)


def price_binding(product, opts, slab):
    if product.name == "Project Binding":
        return {"Paper Rexon": 120.0, "Diamond Rexon": 180.0, "Leather": 350.0}.get(opts.get("Binding Material", ""), 150.0)
    return {"Art Board Print - Without Lamination": 15.0, "Art Board Print - With Lamination": 25.0,
            "Leather Printing - Screen": 60.0, "Leather Printing - Leather": 90.0}.get(opts.get("Wrapper Print Type", ""), 30.0)


def price_register(product, opts, slab, cover=8.0, side_factor=1.0):
    area = area_sq_in(opts.get("Size", ""), 97.0)
    pages = slab.min_quantity
    total = pages * 0.0057 * area * side_factor + cover + 0.12 * area
    return round(total / 5) * 5 / pages  # whole-rupee (to the nearest 5) register price spread per page


def price_tc(product, opts, slab):
    return price_register(product, opts, slab, cover=10.0, side_factor=1.5 if opts.get("Side") == "Both Side" else 1.0)


def price_digital_sheet(base_by_band):
    def fn(product, opts, slab):
        band = base_by_band[slab_index(slab, [1, 51, 101, 501])]
        return band * paper_factor(opts.get("Paper/GSM Type", "Maplitho 80 GSM"))
    return fn


def price_visiting_card(product, opts, slab):
    q = slab.min_quantity
    finish = {"Without Lamination": 1.0, "Gloss Lamination": 1.25, "Matt Lamination": 1.3, "3D Lamination/Ivory": 1.5}.get(
        opts.get("Finish/Lamination Type", ""), 1.8)
    side = 1.35 if opts.get("Side") == "Front & Back" else 1.0
    return 2.2 * (q / 100) ** -0.33 * finish * side


def price_id_card(product, opts, slab):
    base = {"Synthetic ID Card": 12.0, "PVC ID Card": 32.0, "Chip Card": 95.0, "Temporary ID Card": 6.0}[product.name]
    return base * (1.4 if opts.get("Side") == "Front & Back" else 1.0)


def price_thamboola(product, opts, slab):
    return 5.5 if opts.get("Side") == "Both Side" else 3.5


def price_banner(product, opts, slab):  # per sq ft
    return {"Flex": 12.0, "Star Flex": 16.0, "Sticker": 28.0, "Oneway Sticker": 55.0, "Clear Sticker": 40.0,
            "Eco Solvent Sticker": 45.0, "Sunpack Sheet": 65.0, "Foam Sheet": 85.0, "Acrylic Sheet": 220.0}.get(
        opts.get("Media Type", ""), 20.0)


SERVICES = {
    "Invitation & Greeting Cards": price_invitation,
    "Book Covers": price_book_cover,
    "Binding Services": price_binding,
    "Register": price_register,
    "Transfer Certificate": price_tc,
    "Application Form": price_digital_sheet([14.0, 11.0, 8.0, 6.5]),
    "Visiting Card": price_visiting_card,
    "ID Card": price_id_card,
    "Menu Card": price_digital_sheet([22.0, 18.0, 14.0, 11.0]),
    "Thamboola Bag": price_thamboola,
    "Digital Banner": price_banner,
}

# ---------------------------------------------------------------- extra charges: name -> (type, amount)
LAM = {"Lamination - Glass": (UNIT, 1.5), "Lamination - Matt": (UNIT, 1.8), "Lamination - 3D": (UNIT, 3.5),
       "Lamination - Thermal Glass": (UNIT, 2.0), "Lamination - Thermal Matt": (UNIT, 2.2)}
BIND_BOOK = {"Binding - Soft Binding": (FLAT, 60), "Binding - Hard Binding": (FLAT, 150), "Binding - Calico Binding": (FLAT, 120),
             "Binding - Paper Rexon": (FLAT, 140), "Binding - Rexon Binding": (FLAT, 180), "Binding - Rexon Corner": (FLAT, 220),
             "Binding - Full Rexon": (FLAT, 260), "Binding - Leather": (FLAT, 400), "Binding - Leather Corner": (FLAT, 450),
             "Binding Type - Side Binding": (FLAT, 40), "Binding Type - Center Binding": (FLAT, 60),
             "Binding Type - Section Binding": (FLAT, 80), "Binding Set - 25 Set": (FLAT, 20), "Binding Set - 50 Set": (FLAT, 30),
             "Binding Set - 100 Set": (FLAT, 45), "Binding Set - 200 Set": (FLAT, 70)}
PAPER_PCT = {"Paper Name - Royal Ex.Bond": (PCT, 20), "Paper Name - Excel Bond": (PCT, 10), "Paper Name - Sirpur Ledger": (PCT, 25),
             "Paper Name - Palarpur Ledger": (PCT, 25), "Paper Name - Westcos Ledger": (PCT, 25), "Paper Name - White Paper": (PCT, 0),
             "Paper Name - Ledger Paper": (PCT, 25), "Paper Name - Foreign Paper": (PCT, 60), "Paper Name - Special Paper": (PCT, 40),
             "Printing Color - 1 Color": (PCT, 0), "Printing Color - 2 Color": (PCT, 10), "Printing Color - 3 Color": (PCT, 18),
             "Printing Color - Multi Color": (PCT, 35)}
CHARGES = {
    "Invitation & Greeting Cards": {**LAM, "Special Work - UV": (UNIT, 1.5), "Special Work - Nurling": (UNIT, 2.0),
        "Special Work - UV with Nurling": (UNIT, 3.0), "Special Work - Gold Foiling": (FLAT, 900), "Special Work - Silver Foiling": (FLAT, 900),
        "Special Work - Emposing": (FLAT, 700), "Pasting Charge": (UNIT, 1.0), "Thread Stitching": (FLAT, 150), "Bottom Folding": (FLAT, 100),
        "Image/Sticker Pasting": (UNIT, 1.0), "Designing Charge": (FLAT, 500), "Custom Work": (FLAT, 250)},
    "Book Covers": {"Lamination - Glass": (UNIT, 3.0), "Lamination - Matt": (UNIT, 3.5), "Lamination - 3D": (UNIT, 6.0),
        "Special Work - Nurling": (UNIT, 3.0), "Special Work - Gold Foiling": (FLAT, 900), "Special Work - Silver Foiling": (FLAT, 900),
        "Special Work - Emposing": (FLAT, 700)},
    "Binding Services": {"Binding Type - Stitching Only": (UNIT, 40), "Binding Type - Soft Binding": (UNIT, 60), "Binding Type - Spiral Binding": (UNIT, 50),
        "Binding Type - Lamination Binding": (UNIT, 80), "Binding Type - Without Stitch": (UNIT, 30), "Binding Type - Hard Binding": (UNIT, 150),
        "Binding Type - Hard Binding Corner": (UNIT, 190), "Binding Type - Paper Rexon": (UNIT, 120), "Binding Type - Diamond Rexon": (UNIT, 180),
        "Binding Type - Diamond Rexon Corner": (UNIT, 230), "Leather Binding - With Marble": (UNIT, 400), "Leather Binding - Corner": (UNIT, 450),
        "Leather Binding - Paper Rexon": (UNIT, 380), "Leather Binding - With Diamond Rexon": (UNIT, 450)},
    "Register": {**PAPER_PCT, **BIND_BOOK},
    "Transfer Certificate": {**PAPER_PCT, **BIND_BOOK},
    "Application Form": {"Side - Both Side Printing": (PCT, 30), "Folding - Two Folding": (UNIT, 0.5), "Folding - Three Folding": (UNIT, 0.7),
        "Folding - 4 Folding": (UNIT, 0.9), "Folding - Booklet": (UNIT, 1.5)},
    "Visiting Card": {"Designing Charge": (FLAT, 300), "Logo Designing Charge": (FLAT, 600), "Corner Cutting - Two Corner": (FLAT, 60),
        "Corner Cutting - Four Corner": (FLAT, 100), "Foiling - Gold": (FLAT, 700), "Foiling - Silver": (FLAT, 700)},
    "ID Card": {"Holder - Portrait": (UNIT, 8), "Holder - Landscape": (UNIT, 8), "Holder Quality - First Quality": (UNIT, 6),
        "Holder Quality - 2nd Quality": (UNIT, 3), "Rope - Single Color": (UNIT, 5), "Rope - Multi Color": (UNIT, 7), "Hook Model": (UNIT, 10),
        "PVC Pouch - Portrait": (UNIT, 6), "PVC Pouch - Landscape": (UNIT, 6), "ID Sticker Only": (UNIT, 4)},
    "Menu Card": {"Designing Charge": (FLAT, 500), **LAM, "Special Work - Nurling": (UNIT, 3.0), "Special Work - Gold Foiling": (FLAT, 1000),
        "Special Work - Silver Foiling": (FLAT, 1000), "Special Work - Emposing": (FLAT, 800),
        "Board - Art Board": (UNIT, 4), "Board - Matt Art": (UNIT, 5), "Board - Criss Cross Board": (UNIT, 9), "Board - Needlepoint Board": (UNIT, 9),
        "Board - Gold Metalik": (UNIT, 12), "Board - Silver Metalik": (UNIT, 12), "Board - Nurling Board": (UNIT, 10), "Board - Special Board": (UNIT, 14),
        "Binding - Soft Binding": (UNIT, 15), "Binding - Hard Binding": (UNIT, 40), "Binding - Calico Binding": (UNIT, 35),
        "Binding - Paper Rexon": (UNIT, 30), "Binding - Rexon Binding": (UNIT, 40), "Binding - Rexon Corner": (UNIT, 50),
        "Binding - Full Rexon": (UNIT, 60), "Binding - Leather": (UNIT, 90), "Binding - Leather Corner": (UNIT, 100),
        "Binding - Pouch Lamination": (UNIT, 12), "Binding - Soft Biding": (UNIT, 15), "Binding - Karishma Bind": (UNIT, 25),
        "Binding - Wiro Biding": (UNIT, 30), "Binding - Spiral Binding": (UNIT, 25), "Binding - Case Biding": (UNIT, 70)},
    "Thamboola Bag": {"Cover Charge": (FLAT, 150), "Printing Color": (FLAT, 250)},
    "Digital Banner": {"Front Light": (SQFT, 6), "Back Light": (SQFT, 10), "With Frame": (SQFT, 18), "With Fittings": (FLAT, 250),
        "Transport Charge": (FLAT, 300)},
}


def main():
    stats = {"cells": 0, "charges": 0, "stamps": 0}
    per_service = {}
    for name, fn in SERVICES.items():
        cat = db.query(ProductCategory).filter_by(name=name).first()
        if not cat:
            continue
        n = 0
        for cell, product, opts, slab in cells_for(cat):
            cell.unit_price = nice(fn(product, opts, slab))
            n += 1
        for charge in db.query(ExtraCharge).filter_by(category_id=cat.id):
            spec = CHARGES.get(name, {}).get(charge.name)
            if spec and not charge.amount:
                charge.charge_type, charge.amount = spec
                n += 1
                stats["charges"] += 1
        stats["cells"] += n
        per_service[name] = n

    # rubber stamps with no price yet: scale from stamp area in mm
    stamp_cat = db.query(ProductCategory).filter_by(name="Rubber Stamp").first()
    if stamp_cat:
        for p in db.query(Product).filter_by(category_id=stamp_cat.id):
            if not p.fixed_price:
                m = re.search(r"\((\d+)\s*x\s*(\d+)\s*mm\)", p.name)
                area = int(m.group(1)) * int(m.group(2)) if m else 600
                p.fixed_price = max(30.0, math.ceil((25 + area * 0.075) / 5) * 5.0)
                stats["stamps"] += 1

    db.commit()
    print("Default prices filled (only entries that were Rs.0):")
    for k, v in per_service.items():
        print(f"  {k:<30}{v:>5} entries")
    print(f"  Rubber Stamp fixed prices set: {stats['stamps']}")


if __name__ == "__main__":
    main()
