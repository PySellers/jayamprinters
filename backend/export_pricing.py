"""
Exports the pricing catalogue (categories' minimum charge / guided flow, attributes and
option surcharges, quantity slabs, extra charges, products' fixed prices and every
price-matrix cell) to pricing_data/pricing_snapshot.json, keyed by NAMES rather than
database ids so it can be loaded into any environment with import_pricing.py.

Contains prices only -- no customers, orders or credentials.

Usage:
    cd backend && venv\\Scripts\\activate && python export_pricing.py
"""

import json
from pathlib import Path

from app.core.database import SessionLocal
from app.models.attribute import Attribute, AttributeOption
from app.models.extra_charge import ExtraCharge
from app.models.price_matrix import PriceMatrixCell
from app.models.product import Product, ProductCategory
from app.models.quantity_slab import QuantitySlab

OUT = Path(__file__).parent / "pricing_data" / "pricing_snapshot.json"


def main():
    db = SessionLocal()
    options = {o.id: o for o in db.query(AttributeOption)}
    attributes = {a.id: a for a in db.query(Attribute)}
    slabs = {s.id: s for s in db.query(QuantitySlab)}
    snapshot = {"version": 1, "categories": []}

    for cat in db.query(ProductCategory).order_by(ProductCategory.id):
        entry = {
            "name": cat.name, "is_active": cat.is_active, "guided_flow": cat.guided_flow, "min_charge": cat.min_charge,
            "attributes": [], "slabs": [], "charges": [], "products": [],
        }
        for attr in db.query(Attribute).filter_by(category_id=cat.id).order_by(Attribute.display_order, Attribute.id):
            entry["attributes"].append({
                "name": attr.name, "is_required": attr.is_required, "display_order": attr.display_order,
                "is_active": attr.is_active, "in_price_matrix": attr.in_price_matrix,
                "options": [
                    {"value": o.value, "extra_price": o.extra_price, "display_order": o.display_order, "is_active": o.is_active}
                    for o in sorted(attr.options, key=lambda o: (o.display_order, o.id))
                ],
            })
        for s in db.query(QuantitySlab).filter_by(category_id=cat.id).order_by(QuantitySlab.display_order, QuantitySlab.id):
            entry["slabs"].append({
                "min_quantity": s.min_quantity, "max_quantity": s.max_quantity, "label": s.label,
                "display_order": s.display_order, "is_incremental": s.is_incremental,
            })
        for c in db.query(ExtraCharge).filter_by(category_id=cat.id).order_by(ExtraCharge.id):
            req = options.get(c.requires_option_id)
            entry["charges"].append({
                "name": c.name, "charge_type": c.charge_type.value, "amount": c.amount, "is_active": c.is_active,
                "group_name": c.group_name,
                "requires": [attributes[req.attribute_id].name, req.value] if req else None,
            })
        for p in db.query(Product).filter_by(category_id=cat.id).order_by(Product.id):
            cells = []
            for cell in db.query(PriceMatrixCell).filter_by(product_id=p.id).order_by(PriceMatrixCell.id):
                s = slabs[cell.quantity_slab_id]
                cells.append({
                    "slab": [s.min_quantity, s.max_quantity],
                    "options": sorted([attributes[o.attribute_id].name, options[o.attribute_option_id].value] for o in cell.options),
                    "unit_price": cell.unit_price, "is_active": cell.is_active,
                })
            entry["products"].append({
                "name": p.name, "pricing_type": p.pricing_type.value if p.pricing_type else None,
                "fixed_price": p.fixed_price, "is_active": p.is_active, "description": p.description, "cells": cells,
            })
        snapshot["categories"].append(entry)

    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(snapshot, indent=1, ensure_ascii=False), encoding="utf-8")
    cells = sum(len(p["cells"]) for c in snapshot["categories"] for p in c["products"])
    print(f"Exported {len(snapshot['categories'])} categories, "
          f"{sum(len(c['products']) for c in snapshot['categories'])} products, {cells} price cells -> {OUT}")


if __name__ == "__main__":
    main()
