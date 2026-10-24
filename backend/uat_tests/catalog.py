"""Looks up real catalogue ids through the API (never the database) so tests behave like the screens do."""

from functools import lru_cache

from framework import admin, api


@lru_cache(maxsize=None)
def _get(path):
    r = api("GET", path, token=admin())
    assert r.status == 200, f"GET {path} -> {r.status}"
    return r.data


def category(name):
    return next(c for c in _get("/product-categories/?limit=500") if c["name"] == name)


def product(cat_name, product_name):
    cid = category(cat_name)["id"]
    return next(p for p in _get("/products/?limit=1000") if p["category_id"] == cid and p["name"] == product_name)


def option(cat_name, attr, value):
    cid = category(cat_name)["id"]
    a = next(x for x in _get(f"/attributes/?category_id={cid}") if x["name"] == attr)
    o = next(x for x in a["options"] if x["value"] == value)
    return dict(attribute_id=a["id"], attribute_option_id=o["id"])


def charge(cat_name, name):
    cid = category(cat_name)["id"]
    return next(c for c in _get(f"/extra-charges/?category_id={cid}") if c["name"] == name and c["is_active"])["id"]


def item(cat_name, product_name, qty, options=(), charges=(), area=None, sets=1, notes=None):
    return dict(product_id=product(cat_name, product_name)["id"], quantity=qty, area_sqft=area, sets=sets, spec_notes=notes,
                selected_options=[option(cat_name, a, v) for a, v in options], extra_charge_ids=[charge(cat_name, c) for c in charges])


def clear():
    _get.cache_clear()
