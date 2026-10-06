"""
Seeds the "Rubber Stamp" catalog from the client PDF (pages 20-21).

Unlike every other category, the Polymer Stamp size/price list on page 20
gives REAL fixed prices per size code -- those are seeded as-is, not as
Rs.0 placeholders.

Each size code is its own fixed-price Product (pricing_type=fixed), since a
rubber stamp is priced as a flat per-item rate with no quantity/attribute
matrix.

Coverage gaps (seeded as empty product shells with fixed_price=None, for
the owner to fill in once they provide rate cards):
  - Dura-Preink Stamp, Sun Stamp, Numbering Seal Small: named on page 20 but
    no size/price table was given.
  - The "Printer" dater/pocket-stamp series (page 21): a size list is given
    but the Rs. column is blank in the source PDF.

Safe to re-run.

Usage:
    cd backend && venv\\Scripts\\activate && python seed_rubber_stamp.py
"""

from app.core.database import SessionLocal
from app.models.product import ProductCategory, Product, ProductPricingType
from app.utils.seed_helpers import get_or_create

db = SessionLocal()

# (code, size_mm, price_rs)
POLYMER_STAMP_SIZES = [
    ("A1", "25x8", 30), ("A2", "35x8", 30), ("A3", "50x8", 35), ("A4", "60x8", 40),
    ("A5", "25x12", 40), ("A6", "35x12", 40), ("A7", "50x12", 60), ("A8", "60x12", 70),
    ("A9", "70x12", 80), ("A10", "16x16", 30), ("A11", "35x16", 50), ("A12", "50x16", 60),
    ("A13", "60x16", 60), ("A14", "35x20", 70), ("A15", "50x20", 70), ("A16", "24x24", 40),
    ("A17", "40x24", 60), ("A18", "14x14", 60), ("A19", "22x22", 80), ("A20", "30x30", 120),
    ("A21", "34x34", 140),
    ("B1", "80x12", 60), ("B2", "70x16", 60), ("B3", "80x16", 80), ("B4", "60x20", 80),
    ("B5", "70x20", 90), ("B6", "80x20", 100), ("B7", "50x24", 80), ("B8", "60x24", 80),
    ("B9", "70x24", 100), ("B10", "80x24", 120), ("B11", "50x28", 120), ("B12", "60x28", 120),
    ("B13", "32x32", 90), ("B14", "55x32", 120), ("B15", "38x38", 130), ("B16", "46x46", 140),
    ("B17", "40x30", 100), ("B18", "55x33", 120),
    ("C1", "100x12", 100), ("C2", "100x16", 100), ("C3", "100x20", 120), ("C4", "70x28", 120),
    ("C5", "80x28", 140), ("C6", "65x32", 140), ("C7", "80x32", 150), ("C8", "60x36", 150),
    ("C9", "75x36", 140), ("C10", "40x40", 120), ("C11", "55x40", 140), ("C12", "70x40", 180),
    ("C13", "54x54", 180), ("C14", "60x40", 180), ("C15", "70x50", 200),
    ("D1", "70x50", 150),
    ("X1", "123x15", 150), ("X2", "123x25", 160), ("X3", "123x35", 200), ("X4", "123x48", 250),
    ("X5", "123x62", 300), ("X6", "123x76", 400), ("X7", "123x96", 500), ("X8", "86x48", 150),
    ("X9", "86x58", 160), ("X10", "76x76", 250), ("X11", "96x76", 300), ("X12", "86x66", 250),
    ("X13", "94x44", 200), ("X14", "96x96", 400), ("X15", "76x52", 200), ("X16", "96x66", 300),
]

PRINTER_DATER_SIZES = [
    "Printer C10 (10x27 mm)", "Printer C20 (14x38 mm)", "Printer C30 (18x47 mm)",
    "Printer C40 (23x59 mm)", "Printer C50 (30x69 mm)", "Printer C60 (37x76 mm)",
    "Printer S200 (24x45 mm)", "Printer 53 (30x45 mm)", "Printer 35 (30x50 mm)",
    "Printer 38 (33x56 mm)", "Printer 54 (40x50 mm)", "Printer 55 (40x60 mm)",
    "Printer 05 (6x15 mm)", "Printer 15 (10x69 mm)", "Printer 25 (15x75 mm)",
]

NO_RATE_CARD_STAMP_TYPES = ["Dura-Preink Stamp", "Sun Stamp", "Numbering Seal Small"]


def main():
    created_counts = {"categories": 0, "products": 0}

    category, created = get_or_create(db, ProductCategory, name="Rubber Stamp", defaults={"is_active": True})
    created_counts["categories"] += int(created)

    for code, size_mm, price in POLYMER_STAMP_SIZES:
        name = f"Polymer Stamp {code} ({size_mm}mm)"
        _, created = get_or_create(
            db, Product, name=name, category_id=category.id,
            defaults={"pricing_type": ProductPricingType.fixed, "fixed_price": float(price), "is_active": True},
        )
        created_counts["products"] += int(created)

    for name in PRINTER_DATER_SIZES:
        _, created = get_or_create(
            db, Product, name=name, category_id=category.id,
            defaults={"pricing_type": ProductPricingType.fixed, "fixed_price": None, "is_active": True},
        )
        created_counts["products"] += int(created)

    for name in NO_RATE_CARD_STAMP_TYPES:
        _, created = get_or_create(
            db, Product, name=name, category_id=category.id,
            defaults={"pricing_type": ProductPricingType.fixed, "fixed_price": None, "is_active": True},
        )
        created_counts["products"] += int(created)

    db.commit()

    print("Rubber Stamp catalog seeded successfully.")
    for key, count in created_counts.items():
        print(f"  {key}: {count} newly created")
    print(f"  ({len(POLYMER_STAMP_SIZES)} Polymer Stamp sizes seeded with real PDF prices)")
    print(f"  ({len(PRINTER_DATER_SIZES) + len(NO_RATE_CARD_STAMP_TYPES)} products seeded with no price -- owner must fill in)")


if __name__ == "__main__":
    main()
