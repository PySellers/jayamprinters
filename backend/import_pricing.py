"""
Loads pricing_data/pricing_snapshot.json (made by export_pricing.py) into the current
database, matching everything by NAME: category, attribute + option value, slab range,
extra-charge name, product name and the cell's option combination. Existing rows are
updated to the snapshot's values; missing ones are created. Nothing is ever deleted
and customers / orders are never touched.

Usage:
    python import_pricing.py            # apply
    python import_pricing.py --dry-run  # report what would change, then roll back
"""

import json
import sys
from pathlib import Path

from app.core.database import SessionLocal
from app.models.attribute import Attribute, AttributeOption
from app.models.extra_charge import ChargeType, ExtraCharge
from app.models.price_matrix import PriceMatrixCell, PriceMatrixCellOption
from app.models.product import Product, ProductCategory, ProductPricingType
from app.models.quantity_slab import QuantitySlab

SNAPSHOT = Path(__file__).parent / "pricing_data" / "pricing_snapshot.json"


class Counter(dict):
    def bump(self, key, n=1):
        self[key] = self.get(key, 0) + n


def set_if_changed(obj, field, value, stats, label):
    if getattr(obj, field) != value:
        setattr(obj, field, value)
        stats.bump(f"{label} updated")
        return True
    return False


def main(dry_run: bool):
    data = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
    db = SessionLocal()
    stats = Counter()
    try:
        for cat_data in data["categories"]:
            cat = db.query(ProductCategory).filter_by(name=cat_data["name"]).first()
            if not cat:
                cat = ProductCategory(name=cat_data["name"], is_active=cat_data["is_active"])
                db.add(cat)
                db.flush()
                stats.bump("categories created")
            set_if_changed(cat, "guided_flow", cat_data["guided_flow"], stats, "category fields")
            set_if_changed(cat, "min_charge", cat_data["min_charge"], stats, "category fields")

            # attributes + option surcharges
            attrs, opts = {}, {}
            for a in cat_data["attributes"]:
                attr = db.query(Attribute).filter_by(category_id=cat.id, name=a["name"]).first()
                if not attr:
                    attr = Attribute(category_id=cat.id, name=a["name"], is_required=a["is_required"],
                                     display_order=a["display_order"], is_active=a["is_active"], in_price_matrix=a["in_price_matrix"])
                    db.add(attr)
                    db.flush()
                    stats.bump("attributes created")
                for f in ("in_price_matrix", "is_required", "display_order", "is_active"):
                    set_if_changed(attr, f, a[f], stats, "attribute fields")
                attrs[a["name"]] = attr
                for o in a["options"]:
                    opt = db.query(AttributeOption).filter_by(attribute_id=attr.id, value=o["value"]).first()
                    if not opt:
                        opt = AttributeOption(attribute_id=attr.id, value=o["value"], extra_price=o["extra_price"],
                                              display_order=o["display_order"], is_active=o["is_active"])
                        db.add(opt)
                        db.flush()
                        stats.bump("options created")
                    for f in ("extra_price", "display_order", "is_active"):
                        set_if_changed(opt, f, o[f], stats, "option fields")
                    opts[(a["name"], o["value"])] = opt

            # slabs
            slab_by_range = {}
            for s in cat_data["slabs"]:
                slab = db.query(QuantitySlab).filter_by(
                    category_id=cat.id, min_quantity=s["min_quantity"], max_quantity=s["max_quantity"]
                ).first()
                if not slab:
                    slab = QuantitySlab(category_id=cat.id, min_quantity=s["min_quantity"], max_quantity=s["max_quantity"],
                                        label=s["label"], display_order=s["display_order"], is_incremental=s["is_incremental"])
                    db.add(slab)
                    db.flush()
                    stats.bump("slabs created")
                for f in ("label", "display_order", "is_incremental"):
                    set_if_changed(slab, f, s[f], stats, "slab fields")
                slab_by_range[(s["min_quantity"], s["max_quantity"])] = slab

            # extra charges
            for c in cat_data["charges"]:
                charge = db.query(ExtraCharge).filter_by(category_id=cat.id, name=c["name"]).first()
                req = opts.get(tuple(c["requires"])) if c["requires"] else None
                if c["requires"] and not req:
                    stats.bump("charges skipped (required option missing)")
                    continue
                if not charge:
                    charge = ExtraCharge(category_id=cat.id, name=c["name"], charge_type=ChargeType(c["charge_type"]),
                                         amount=c["amount"], is_active=c["is_active"], group_name=c["group_name"],
                                         requires_option_id=req.id if req else None)
                    db.add(charge)
                    db.flush()
                    stats.bump("charges created")
                set_if_changed(charge, "charge_type", ChargeType(c["charge_type"]), stats, "charge fields")
                for f in ("amount", "is_active", "group_name"):
                    set_if_changed(charge, f, c[f], stats, "charge fields")
                set_if_changed(charge, "requires_option_id", req.id if req else None, stats, "charge fields")

            # products + matrix cells
            for p in cat_data["products"]:
                product = db.query(Product).filter_by(category_id=cat.id, name=p["name"]).first()
                if not product:
                    product = Product(category_id=cat.id, name=p["name"], description=p["description"],
                                      pricing_type=ProductPricingType(p["pricing_type"]) if p["pricing_type"] else None,
                                      fixed_price=p["fixed_price"], is_active=p["is_active"])
                    db.add(product)
                    db.flush()
                    stats.bump("products created")
                set_if_changed(product, "pricing_type", ProductPricingType(p["pricing_type"]) if p["pricing_type"] else None, stats, "product pricing types")
                set_if_changed(product, "fixed_price", p["fixed_price"], stats, "product prices")
                set_if_changed(product, "is_active", p["is_active"], stats, "product fields")

                existing = {}
                for cell in db.query(PriceMatrixCell).filter_by(product_id=product.id):
                    key = (cell.quantity_slab_id, frozenset((o.attribute_id, o.attribute_option_id) for o in cell.options))
                    existing[key] = cell
                for c in p["cells"]:
                    slab = slab_by_range.get(tuple(c["slab"]))
                    pairs = [(attrs[a].id, opts[(a, v)].id) for a, v in c["options"] if a in attrs and (a, v) in opts]
                    if not slab or len(pairs) != len(c["options"]):
                        stats.bump("cells skipped (slab/option missing)")
                        continue
                    cell = existing.get((slab.id, frozenset(pairs)))
                    if cell is None:
                        cell = PriceMatrixCell(product_id=product.id, quantity_slab_id=slab.id,
                                               unit_price=c["unit_price"], is_active=c["is_active"])
                        db.add(cell)
                        db.flush()
                        for attr_id, opt_id in pairs:
                            db.add(PriceMatrixCellOption(price_matrix_cell_id=cell.id, attribute_id=attr_id, attribute_option_id=opt_id))
                        stats.bump("price cells created")
                    else:
                        set_if_changed(cell, "unit_price", c["unit_price"], stats, "price cells")
                        set_if_changed(cell, "is_active", c["is_active"], stats, "price cells")
        if dry_run:
            db.rollback()
        else:
            db.commit()
    except Exception:
        db.rollback()
        raise
    prefix = "DRY RUN (nothing saved) -- " if dry_run else "Pricing imported -- "
    print(prefix + (", ".join(f"{k}: {v}" for k, v in sorted(stats.items())) or "no changes needed"))


if __name__ == "__main__":
    main("--dry-run" in sys.argv)
