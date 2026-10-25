"""
Client enhancements, round 1 (Oct 2026): copies start at "1", "Nil" bill type, HSN codes and the first printing
charges. Safe to re-run (get-or-create / only fills what is missing).

  * Copies per Set gets a "1" option (no extra copy) ahead of 1+1 ... 1+6. Extra copies are now priced as paper
    (each copy in its own GSM), so the old flat per-copy surcharge on those options is cleared.
  * Binding Set charges for the new "1" option, so binding can be priced for a single-copy book too.
  * "Bill Type - Nil" (no charge) for services that have no bill type.
  * HSN codes with TEST GST rates and a default HSN for every service. The client will send the real codes and
    rates; until then everything can be changed under Masters > HSN Codes.
  * TEST printing charges (on top of paper cost) for a few services, to be replaced by the client's own figures.

Usage:
    cd backend && venv\\Scripts\\activate && python seed_enhancements_1.py
"""

from app.core.database import SessionLocal
from app.models.attribute import Attribute, AttributeOption
from app.models.company import HsnCode
from app.models.extra_charge import ChargeType, ExtraCharge
from app.models.product import ProductCategory

db = SessionLocal()

# (code, description, TEST gst %) -- replace with the client's confirmed codes / rates.
HSN = [
    ("4911", "Printed matter - labels, forms, price lists, cards (TEST rate)", 18.0),
    ("4820", "Registers, account / bill / note books, letter pads (TEST rate)", 18.0),
    ("4909", "Printed or illustrated cards - visiting, invitation, greeting (TEST rate)", 12.0),
    ("4901", "Printed books, brochures, leaflets (TEST rate)", 5.0),
    ("4819", "Paper carton / bags (TEST rate)", 18.0),
    ("3926", "Plastic articles - PVC cards, holders (TEST rate)", 18.0),
    ("9611", "Date / hand stamps (TEST rate)", 18.0),
    ("3920", "Plastic sheet - flex banner (TEST rate)", 18.0),
    ("998912", "Printing and binding job work - SAC (TEST rate)", 18.0),
]
SERVICE_HSN = {
    "Bill Books & Stationery": "4820",
    "Register": "4820",
    "Transfer Certificate": "4911",
    "Application Form": "4911",
    "Menu Card": "4911",
    "Book Covers": "4901",
    "Visiting Card": "4909",
    "Invitation & Greeting Cards": "4909",
    "Thamboola Bag": "4819",
    "ID Card": "3926",
    "Rubber Stamp": "9611",
    "Digital Banner": "3920",
    "Binding Services": "998912",
    "Xerox / Photocopy": "998912",
}
# service -> (mode, block size, block rate, per-copy rate)  [TEST figures]
PRINT_CHARGES = {
    "Bill Books & Stationery": ("block", 1000, 500.0, None),
    "Application Form": ("block", 1000, 400.0, None),
    "Invitation & Greeting Cards": ("block", 500, 300.0, None),
    "Visiting Card": ("block", 1000, 250.0, None),
    "Book Covers": ("block", 500, 300.0, None),
    "Transfer Certificate": ("block", 500, 200.0, None),
    "Menu Card": ("per_copy", None, None, 1.0),
    "Register": ("per_copy", None, None, 0.5),
}
COPIES = ["1", "1+1", "1+2", "1+3", "1+4", "1+5", "1+6"]
SET_SIZES = ["25 Set", "50 Set", "100 Set", "200 Set", "Custom"]


def main():
    made = {"hsn": 0, "options": 0, "charges": 0}

    # ---- HSN codes + service defaults -------------------------------------------------
    hsn_by_code = {}
    for code, description, rate in HSN:
        row = db.query(HsnCode).filter_by(code=code).first()
        if not row:
            row = HsnCode(code=code, description=description, gst_rate=rate, is_active=True)
            db.add(row)
            made["hsn"] += 1
        hsn_by_code[code] = row
    db.flush()
    for service, code in SERVICE_HSN.items():
        category = db.query(ProductCategory).filter_by(name=service).first()
        if category and category.hsn_id is None:
            category.hsn_id = hsn_by_code[code].id

    # ---- printing charges (only where none is set yet) --------------------------------
    for service, (mode, size, block_rate, copy_rate) in PRINT_CHARGES.items():
        category = db.query(ProductCategory).filter_by(name=service).first()
        if category and not category.print_charge_mode:
            category.print_charge_mode = mode
            category.print_block_size = size
            category.print_block_rate = block_rate
            category.print_per_copy_rate = copy_rate

    # ---- Bill Books: copies start at "1" -----------------------------------------------
    category = db.query(ProductCategory).filter_by(name="Bill Books & Stationery").first()
    if category:
        copies_attr = db.query(Attribute).filter_by(category_id=category.id, name="Copies per Set").first()
        if copies_attr:
            options = {o.value: o for o in copies_attr.options}
            for order, value in enumerate(COPIES):
                opt = options.get(value)
                if not opt:
                    opt = AttributeOption(attribute_id=copies_attr.id, value=value, extra_price=0.0, display_order=order, is_active=True)
                    db.add(opt)
                    options[value] = opt
                    made["options"] += 1
                opt.display_order = order
                opt.extra_price = 0.0  # extra copies are priced as paper now, not as a flat surcharge
            db.flush()

            for size in SET_SIZES:
                template = db.query(ExtraCharge).filter_by(category_id=category.id, name=f"Binding Set - {size} (1+1)").first()
                name = f"Binding Set - {size} (1)"
                if template and not db.query(ExtraCharge).filter_by(category_id=category.id, name=name).first():
                    db.add(ExtraCharge(
                        category_id=category.id, name=name, charge_type=template.charge_type,
                        amount=round(template.amount * 0.8, 2), is_active=True, group_name="Binding Set",
                        requires_option_id=options["1"].id,
                    ))
                    made["charges"] += 1

        if not db.query(ExtraCharge).filter_by(category_id=category.id, name="Bill Type - Nil").first():
            db.add(ExtraCharge(category_id=category.id, name="Bill Type - Nil", charge_type=ChargeType.percentage,
                               amount=0.0, is_active=True, group_name="Bill Type"))
            made["charges"] += 1

    db.commit()
    print(f"Enhancements applied: {made['hsn']} HSN codes, {made['options']} options, {made['charges']} charges added.")
    print("Service HSN codes and printing charges use TEST values -- replace them with the client's figures.")


if __name__ == "__main__":
    main()
