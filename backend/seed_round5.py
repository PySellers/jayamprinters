"""Client round 5 data: safe to run more than once.

* Binding Services: the extra charges become two required choices (Binding Type, Leather Binding): None / an option / Custom.
* Rubber Stamp: items get a sub-category (Polymer A..X series, Printer / Dater, Other), so the order form asks for the
  sub-category first and then the size.
* Xerox: more binding choices (Rexine, Tape, Pin). Their price is 0 until the owner sets it in Pricing Setup > Extra Charges.
"""
import re

from app.core.database import SessionLocal
from app.models.extra_charge import ChargeType, ExtraCharge
from app.models.product import Product, ProductCategory

db = SessionLocal()


def binding_services():
    cat = db.query(ProductCategory).filter_by(name="Binding Services").first()
    if not cat:
        return
    for charge in db.query(ExtraCharge).filter_by(category_id=cat.id):
        if charge.group_name:
            continue
        if charge.name.startswith("Leather Binding"):
            charge.group_name = "Leather Binding"
        elif charge.name.startswith("Binding Type"):
            charge.group_name = "Binding Type"
    cat.extras_required = True


def rubber_stamp():
    cat = db.query(ProductCategory).filter_by(name="Rubber Stamp").first()
    if not cat:
        return
    for product in db.query(Product).filter_by(category_id=cat.id):
        if product.sub_category:
            continue
        match = re.match(r"Polymer Stamp ([A-Z])\d+", product.name)
        if match:
            product.sub_category = f"Polymer Stamp - {match.group(1)} Series"
        elif product.name.startswith("Printer "):
            product.sub_category = "Printer / Dater Stamp"
        else:
            product.sub_category = "Other Stamps"


def xerox_binding():
    cat = db.query(ProductCategory).filter_by(name="Xerox / Photocopy").first()
    if not cat:
        return
    for name in ("Rexine Binding", "Tape Binding", "Pin Binding"):
        if not db.query(ExtraCharge).filter_by(category_id=cat.id, name=name).first():
            db.add(ExtraCharge(category_id=cat.id, name=name, charge_type=ChargeType.per_set, amount=0.0, group_name="Binding", is_active=True))


def main():
    binding_services()
    rubber_stamp()
    xerox_binding()
    db.commit()
    print("Round 5 data ready")


if __name__ == "__main__":
    main()
