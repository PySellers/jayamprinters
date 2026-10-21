"""
Pricing-rule fixes for "Bill Books & Stationery" (follow-up to seed_bill_book_guided.py).
Safe to re-run, and never overwrites a price the client has already changed.

1. 54 GSM / 60 GSM carried a Rs.10 per-leaf option surcharge (about 4x a normal
   paper) -- a data-entry slip. Reset to 0 *only* where it is still exactly 10.0.
2. The "1st 1000 Nos" / "Add. 1000 Nos" bands become incremental: 2,500 units =
   1,000 at the first rate + 1,500 at the additional rate (previously the
   additional rate applied to the whole quantity).
3. A minimum charge per line (Rs.300) so tiny runs are not billed at a few rupees.
   Only set when none is configured; edit it in Pricing Setup.
4. Coloured paper now affects price: a "Coloured Layers" charge group
   (1..7 coloured copies, +4% of the base rate per coloured copy -- a percentage so
   it scales with size). The order screen picks the right one automatically from the
   colours chosen per copy. Only created when missing.

Usage:
    cd backend && venv\\Scripts\\activate && python seed_bill_book_pricing_rules.py
"""

from app.core.database import SessionLocal
from app.models.product import ProductCategory
from app.models.attribute import Attribute, AttributeOption
from app.models.quantity_slab import QuantitySlab
from app.models.extra_charge import ExtraCharge, ChargeType
from app.utils.seed_helpers import get_or_create

CATEGORY_NAME = "Bill Books & Stationery"
DEFAULT_MIN_CHARGE = 300.0
COLOURED_LAYER_PERCENT = 4.0
MAX_LAYERS = 7  # 1+6 copies

db = SessionLocal()


def main():
    category = db.query(ProductCategory).filter_by(name=CATEGORY_NAME).first()
    if not category:
        raise SystemExit(f'Category "{CATEGORY_NAME}" not found -- run seed_bill_books.py first.')

    # 1. the Rs.10 slip on thin paper
    gsm_attr = db.query(Attribute).filter_by(category_id=category.id, name="Paper/GSM Type").first()
    fixed = []
    if gsm_attr:
        for option in db.query(AttributeOption).filter(
            AttributeOption.attribute_id == gsm_attr.id,
            AttributeOption.value.in_(["54 GSM", "60 GSM"]),
        ):
            if option.extra_price == 10.0:
                option.extra_price = 0.0
                fixed.append(option.value)

    # 2. incremental bands
    for slab in db.query(QuantitySlab).filter_by(category_id=category.id):
        slab.is_incremental = True

    # 3. minimum charge
    set_min = category.min_charge is None
    if set_min:
        category.min_charge = DEFAULT_MIN_CHARGE

    # 4. coloured-layer charges
    created = 0
    for n in range(1, MAX_LAYERS + 1):
        name = f"Coloured Layers - {n} Layer{'s' if n > 1 else ''}"
        charge, was_created = get_or_create(
            db, ExtraCharge, category_id=category.id, name=name,
            defaults={"charge_type": ChargeType.percentage, "amount": COLOURED_LAYER_PERCENT * n, "is_active": True},
        )
        charge.group_name = "Coloured Layers"
        created += int(was_created)

    db.commit()
    print("Bill Book pricing rules applied.")
    print(f"  thin-paper surcharge reset: {fixed or 'nothing to fix'}")
    print("  slabs set to incremental pricing")
    print(f"  minimum charge: {'set to Rs.%.0f' % DEFAULT_MIN_CHARGE if set_min else 'already configured (%.0f), left as is' % category.min_charge}")
    print(f"  coloured-layer charges created: {created}")


if __name__ == "__main__":
    main()
