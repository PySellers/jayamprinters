"""Starting prices for every service, so that no order shows "price not available": fills ONLY what is missing - it never changes
a price that is already set, so the owner's own changes are safe and it can be run again.

1. Every combination an item can be ordered with (every option of the drop-downs its price depends on x every quantity band it has
   rates for) gets a rate. A missing rate is worked out from its nearest neighbour: Front & Back / Double Side = One Side x 1.8
   (and the other way round), otherwise the average of that band. Rates are rounded to Rs.0.05.
2. Every item gets an open-ended top band ("1001+ Nos") at 5 % under the last band, so a big order is priced too.
3. Binding added to Xerox (Rexine / Tape / Pin) gets a Chennai-market rate if it still has none.

All of these are STARTING prices (Chennai market): the owner checks them in Pricing Setup, or straight from "Why this rate?" on the
order screen, and changes them. Usage: python seed_round7_prices.py [--dry-run]"""
import itertools
import re
import sys
from collections import defaultdict

from app.core.database import SessionLocal
from app.models.attribute import Attribute
from app.models.extra_charge import ExtraCharge
from app.models.price_matrix import PriceMatrixCell, PriceMatrixCellOption
from app.models.product import Product, ProductCategory, ProductPricingType
from app.models.quantity_slab import QuantitySlab

SIDE_NAMES = ("Print Side", "Side")
TWO_SIDE = ("Double Side", "Front & Back", "Both Side")
ONE_SIDE = ("Single Side", "One Side")
TWO_SIDED_FACTOR = 1.8
TOP_BAND_FACTOR = 0.95
XEROX_BINDING_RATES = {"Rexine Binding": 120.0, "Tape Binding": 20.0, "Pin Binding": 5.0}

dry = "--dry-run" in sys.argv
db = SessionLocal()
report = defaultdict(lambda: {"filled": 0, "bands": 0, "minimum": 0})


def r05(value: float) -> float:
    return max(round(round(value / 0.05) * 0.05, 2), 0.05)


def cell_key(cell):
    return frozenset((o.attribute_id, o.attribute_option_id) for o in cell.options)


def add_cell(product, slab_id, options, price):
    cell = PriceMatrixCell(product_id=product.id, quantity_slab_id=slab_id, unit_price=price, is_active=True)
    db.add(cell)
    db.flush()
    for attr_id, opt_id in options:
        db.add(PriceMatrixCellOption(price_matrix_cell_id=cell.id, attribute_id=attr_id, attribute_option_id=opt_id))
    db.flush()
    return cell


def neighbour_price(attr_by_id, opt_value, existing, slab_id, wanted):
    """The price of a missing combination from a neighbour that differs only in the side (one side / two sides)."""
    for attr_id, opt_id in wanted:
        attr = attr_by_id[attr_id]
        if attr.name not in SIDE_NAMES:
            continue
        value = opt_value[opt_id]
        rest = wanted - {(attr_id, opt_id)}
        if value in TWO_SIDE:
            for other in attr.options:
                if other.value in ONE_SIDE and (slab_id, frozenset(rest | {(attr_id, other.id)})) in existing:
                    return existing[(slab_id, frozenset(rest | {(attr_id, other.id)}))] * TWO_SIDED_FACTOR
        if value in ONE_SIDE:
            for other in attr.options:
                if other.value in TWO_SIDE and (slab_id, frozenset(rest | {(attr_id, other.id)})) in existing:
                    return existing[(slab_id, frozenset(rest | {(attr_id, other.id)}))] / TWO_SIDED_FACTOR
    return None


def fill_product(cat, product, attrs, slabs):
    cells = db.query(PriceMatrixCell).filter(PriceMatrixCell.product_id == product.id, PriceMatrixCell.is_active.is_(True)).all()
    if not cells:
        return
    used_attr_ids = {o.attribute_id for c in cells for o in c.options}
    used_attrs = [a for a in attrs if a.id in used_attr_ids]
    attr_by_id = {a.id: a for a in attrs}
    opt_value = {o.id: o.value for a in attrs for o in a.options}
    existing = {(c.quantity_slab_id, cell_key(c)): c.unit_price for c in cells}
    slab_ids = sorted({c.quantity_slab_id for c in cells}, key=lambda i: slabs[i].min_quantity)
    lists = [[(a.id, o.id) for o in a.options if o.is_active] for a in used_attrs]
    if any(not l for l in lists):
        return
    for combo in itertools.product(*lists):
        wanted = frozenset(combo)
        for slab_id in slab_ids:
            if (slab_id, wanted) in existing:
                continue
            price = neighbour_price(attr_by_id, opt_value, existing, slab_id, wanted)
            if price is None:
                same_band = [p for (sid, _), p in existing.items() if sid == slab_id and p > 0]
                if not same_band:
                    continue
                price = sum(same_band) / len(same_band)
            price = r05(price)
            if not dry:
                add_cell(product, slab_id, list(combo), price)
            existing[(slab_id, wanted)] = price
            report[cat.name]["filled"] += 1


def set_minimum_quantity(cat, product, slabs):
    """An item whose first band starts above 1 (Register 32, Transfer Certificate 50) gets that as its minimum order, so the order
    screen starts at a quantity that has a price instead of showing "no rate" at quantity 1."""
    cells = db.query(PriceMatrixCell).filter(PriceMatrixCell.product_id == product.id, PriceMatrixCell.is_active.is_(True)).all()
    if not cells or product.min_quantity:
        return
    lowest = min(slabs[c.quantity_slab_id].min_quantity for c in cells)
    if lowest and lowest > 1:
        if not dry:
            product.min_quantity = lowest
        report[cat.name]["minimum"] = report[cat.name].get("minimum", 0) + 1


def open_top_band(cat, product, slabs):
    """Every item gets a top band without an upper limit."""
    cells = db.query(PriceMatrixCell).filter(PriceMatrixCell.product_id == product.id, PriceMatrixCell.is_active.is_(True)).all()
    if not cells:
        return
    used = {c.quantity_slab_id for c in cells}
    top = max((slabs[i] for i in used), key=lambda s: (s.min_quantity, s.max_quantity or 10**12))
    if top.max_quantity is None or top.is_incremental:
        return
    new_min = top.max_quantity + 1
    label = re.sub(r"\d[\d,]*\s*-\s*\d[\d,]*", f"{new_min:,}+", top.label or "") if top.label and re.search(r"\d[\d,]*\s*-\s*\d[\d,]*", top.label) else f"{new_min:,}+"
    if not label.startswith(str(f"{new_min:,}")):
        label = f"{new_min:,}+"
    slab = db.query(QuantitySlab).filter_by(category_id=cat.id, min_quantity=new_min, max_quantity=None).first()
    if slab is None and not dry:
        slab = QuantitySlab(category_id=cat.id, min_quantity=new_min, max_quantity=None, label=label, display_order=(top.display_order or 0) + 1)
        db.add(slab)
        db.flush()
        slabs[slab.id] = slab
    if slab is None:
        return
    have = {cell_key(c) for c in cells if c.quantity_slab_id == slab.id}
    for c in cells:
        if c.quantity_slab_id != top.id or cell_key(c) in have:
            continue
        if not dry:
            add_cell(product, slab.id, [(o.attribute_id, o.attribute_option_id) for o in c.options], r05(c.unit_price * TOP_BAND_FACTOR))
        report[cat.name]["bands"] += 1


def main():
    for cat in db.query(ProductCategory).filter(ProductCategory.is_active.is_(True)).order_by(ProductCategory.id):
        if cat.name.startswith("ZZ"):
            continue
        attrs = db.query(Attribute).filter(Attribute.category_id == cat.id, Attribute.is_active.is_(True)).all()
        slabs = {s.id: s for s in db.query(QuantitySlab).filter(QuantitySlab.category_id == cat.id)}
        for product in db.query(Product).filter(Product.category_id == cat.id, Product.is_active.is_(True)):
            if product.pricing_type == ProductPricingType.fixed:
                continue
            fill_product(cat, product, attrs, slabs)
            set_minimum_quantity(cat, product, slabs)
            open_top_band(cat, product, slabs)
    cat = db.query(ProductCategory).filter_by(name="Xerox / Photocopy").first()
    if cat:
        for name, rate in XEROX_BINDING_RATES.items():
            charge = db.query(ExtraCharge).filter_by(category_id=cat.id, name=name).first()
            if charge is not None and not charge.amount and not dry:
                charge.amount = rate
                report[cat.name]["filled"] += 1
    if dry:
        db.rollback()
    else:
        db.commit()
    total_f = sum(v["filled"] for v in report.values())
    total_b = sum(v["bands"] for v in report.values())
    for name, v in report.items():
        if v["filled"] or v["bands"] or v.get("minimum"):
            print(f"  {name:34s} rates filled {v['filled']:4d}   top-band rates added {v['bands']:4d}   minimum order set {v.get('minimum', 0)}")
    print(("DRY RUN - nothing saved. " if dry else "Saved. ") + f"{total_f} missing rates filled, {total_b} top-band rates added.")


if __name__ == "__main__":
    main()
