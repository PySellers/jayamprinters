"""
Shared idempotent get-or-create helpers for catalog seed scripts
(ProductCategory / Attribute / AttributeOption / QuantitySlab / PriceMatrixCell).

Extracted from seed_xerox_data.py so every per-category seed script
(seed_invitation.py, seed_bill_books.py, etc.) shares one implementation.
"""

from app.models.attribute import AttributeOption
from app.models.quantity_slab import QuantitySlab
from app.models.price_matrix import PriceMatrixCell, PriceMatrixCellOption


def get_or_create(db, model, defaults=None, **filters):
    instance = db.query(model).filter_by(**filters).first()
    if instance:
        return instance, False
    params = {**filters, **(defaults or {})}
    instance = model(**params)
    db.add(instance)
    db.flush()
    return instance, True


def get_or_create_option(db, attribute_id, value, extra_price=0.0, display_order=0):
    option = db.query(AttributeOption).filter_by(attribute_id=attribute_id, value=value).first()
    if option:
        return option, False
    option = AttributeOption(attribute_id=attribute_id, value=value, extra_price=extra_price, display_order=display_order)
    db.add(option)
    db.flush()
    return option, True


def get_or_create_slab(db, category_id, min_quantity, max_quantity, label, display_order):
    slab = db.query(QuantitySlab).filter_by(category_id=category_id, min_quantity=min_quantity, max_quantity=max_quantity).first()
    if slab:
        return slab, False
    slab = QuantitySlab(category_id=category_id, min_quantity=min_quantity, max_quantity=max_quantity, label=label, display_order=display_order)
    db.add(slab)
    db.flush()
    return slab, True


def get_or_create_cell(db, product_id, quantity_slab_id, option_pairs, unit_price):
    """option_pairs: list of (attribute_id, attribute_option_id) tuples defining the exact match key."""
    candidates = db.query(PriceMatrixCell).filter_by(product_id=product_id, quantity_slab_id=quantity_slab_id).all()
    wanted = set(option_pairs)
    for cell in candidates:
        existing = {(o.attribute_id, o.attribute_option_id) for o in cell.options}
        if existing == wanted:
            cell.unit_price = unit_price
            db.flush()
            return cell, False
    cell = PriceMatrixCell(product_id=product_id, quantity_slab_id=quantity_slab_id, unit_price=unit_price, is_active=True)
    db.add(cell)
    db.flush()
    for attribute_id, option_id in option_pairs:
        db.add(PriceMatrixCellOption(price_matrix_cell_id=cell.id, attribute_id=attribute_id, attribute_option_id=option_id))
    db.flush()
    return cell, True
