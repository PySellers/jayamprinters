"""Client round 9 data: safe to run more than once.

Invitation & Greeting Cards
* Wedding Invitation - Screen Print: new drop-downs "Screen Print" (the occasion) and "Method" (what is printed), each ending
  in Custom (the counter types it); the Paper/Board Type list gets "Nil" (no paper is priced for screen printing).
* Wedding Invitation - Offset: new "Size" drop-down (A5, A4, Custom).
* Both items let the counter type the Printing Charge and the Card Amount (allow_manual_amounts); the order total is
  card amount + printing charge, as on the order screen, quotation, billing summary and final invoice.
The new drop-downs only appear for their own item (Attribute.product_id) and are not part of the price grid.
"""
from app.core.database import SessionLocal
from app.models.attribute import Attribute, AttributeOption
from app.models.product import Product, ProductCategory

db = SessionLocal()

SCREEN = "Wedding Invitation - Screen Print"
OFFSET = "Wedding Invitation - Offset"

NEW_ATTRIBUTES = [
    # (item, attribute name, options, display_order)
    (SCREEN, "Screen Print", ["Wedding Invitation", "House Warming", "Baby Shower", "Birthday", "Custom"], 0),
    (SCREEN, "Method", ["Invitation", "Thamboolam Bag", "Visiting Card", "Pen", "Diary", "Custom"], 0),
    (OFFSET, "Size", ["A5", "A4", "Custom"], 0),
]


def run():
    cat = db.query(ProductCategory).filter_by(name="Invitation & Greeting Cards").first()
    if not cat:
        print("Invitation & Greeting Cards not found - nothing to do")
        return
    products = {p.name: p for p in db.query(Product).filter_by(category_id=cat.id)}

    for name in (SCREEN, OFFSET):
        if name in products:
            products[name].allow_manual_amounts = True

    for item_name, attr_name, options, order in NEW_ATTRIBUTES:
        product = products.get(item_name)
        if not product:
            continue
        attr = db.query(Attribute).filter_by(category_id=cat.id, name=attr_name, product_id=product.id).first()
        if not attr:
            attr = Attribute(category_id=cat.id, name=attr_name, product_id=product.id, is_required=True,
                             display_order=order, is_active=True, in_price_matrix=False)
            db.add(attr)
            db.flush()
        have = {o.value for o in db.query(AttributeOption).filter_by(attribute_id=attr.id)}
        for i, value in enumerate(options):
            if value not in have:
                db.add(AttributeOption(attribute_id=attr.id, value=value, extra_price=0.0, display_order=i, is_active=True))

    # "Nil" paper for the items that take a typed card amount (the order form shows it only for those items)
    paper = db.query(Attribute).filter_by(category_id=cat.id, name="Paper/Board Type", product_id=None).first()
    if paper and not db.query(AttributeOption).filter_by(attribute_id=paper.id, value="Nil").first():
        last = max([o.display_order or 0 for o in db.query(AttributeOption).filter_by(attribute_id=paper.id)] or [0])
        db.add(AttributeOption(attribute_id=paper.id, value="Nil", extra_price=0.0, display_order=last + 1, is_active=True))

    db.commit()
    print("Round 9 data ready")


if __name__ == "__main__":
    run()
