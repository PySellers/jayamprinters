"""
Book Covers: split "Readymade Cover" into one item per printing method.

The item used to carry Offset, Screen and Digital rates side by side (bands 1-500 / 501-1000, 1-100
and 1-50) with nothing to choose between them, so the pricing engine always quoted the cheapest and
the Screen / Digital rates could never be reached. Now each method is its own item:

    Readymade Cover - Offset   (1-500, 501-1000)
    Readymade Cover - Screen   (1-100)
    Readymade Cover - Digital  (1-50)

Existing orders keep working (the original item is renamed, not replaced). Safe to re-run.

Usage:
    cd backend && python fix_book_cover_methods.py
"""

from app.core.database import SessionLocal
from app.models.price_matrix import PriceMatrixCell
from app.models.product import Product, ProductCategory, ProductPricingType
from app.models.quantity_slab import QuantitySlab

db = SessionLocal()
BASE = "Readymade Cover"


def main():
    cat = db.query(ProductCategory).filter_by(name="Book Covers").first()
    if not cat:
        print("No Book Covers service -- nothing to do")
        return
    offset = db.query(Product).filter_by(category_id=cat.id, name=f"{BASE} - Offset").first()
    original = db.query(Product).filter_by(category_id=cat.id, name=BASE).first()
    if original and not offset:
        original.name = f"{BASE} - Offset"
        offset = original
        print(f"Renamed '{BASE}' -> '{BASE} - Offset'")
    if not offset:
        print("Readymade Cover not found -- nothing to do")
        return

    moved = {}
    for method in ("Screen", "Digital"):
        target = db.query(Product).filter_by(category_id=cat.id, name=f"{BASE} - {method}").first()
        if not target:
            target = Product(category_id=cat.id, name=f"{BASE} - {method}", description=offset.description,
                             pricing_type=ProductPricingType.matrix, fixed_price=None, is_active=True)
            db.add(target)
            db.flush()
            print(f"Created '{target.name}'")
        slab_ids = [s.id for s in db.query(QuantitySlab).filter_by(category_id=cat.id) if (s.label or "").endswith(f"({method})")]
        n = 0
        for cell in db.query(PriceMatrixCell).filter(PriceMatrixCell.product_id == offset.id, PriceMatrixCell.quantity_slab_id.in_(slab_ids)):
            cell.product_id = target.id
            n += 1
        moved[method] = n
    db.commit()
    print("Cells moved:", moved)


if __name__ == "__main__":
    main()
