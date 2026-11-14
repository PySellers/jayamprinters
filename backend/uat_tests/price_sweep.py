"""Walks every service the way a counter does - item, every required option, every quantity band - and asks the live pricing engine
for the price. Reports what cannot be priced or comes out at Rs.0. Usage: python price_sweep.py [service name ...]
Writes price_sweep.json (all combinations tested) next to this file."""
import itertools
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from framework import admin, api  # noqa: E402

CAP = int(os.environ.get("SWEEP_CAP", "400"))  # option combinations per item (evenly sampled when there are more)


def get(path):
    r = api("GET", path, token=admin())
    assert r.status == 200, (path, r.status)
    return r.data


def combos(attr_options):
    lists = [[(a["id"], o["id"], o["value"]) for o in a["options"] if o["is_active"]] for a in attr_options]
    if not lists or any(not l for l in lists):
        return [[]]
    total = 1
    for l in lists:
        total *= len(l)
    all_ = itertools.product(*lists)
    if total <= CAP:
        return [list(c) for c in all_]
    step = total / CAP
    out, nxt = [], 0.0
    for i, c in enumerate(all_):
        if i >= nxt:
            out.append(list(c))
            nxt += step
    return out


def main(only=None, quiet=False, write=True):
    cats = [c for c in get("/product-categories/?limit=500") if c["is_active"] and not c["name"].startswith("ZZ")]
    if only:
        cats = [c for c in cats if c["name"] in only]
    products = get("/products/?limit=5000")
    result = {"services": [], "tested": 0, "failed": 0}
    for cat in cats:
        prods = [p for p in products if p["category_id"] == cat["id"] and p["is_active"]]
        attrs = [a for a in get(f"/attributes/?category_id={cat['id']}") if a["is_active"]]
        slabs = get(f"/quantity-slabs/?category_id={cat['id']}")
        entry = {"service": cat["name"], "items": len(prods), "tested": 0, "failed": [], "zero": [], "min_price": None, "max_price": None, "prices": []}
        for p in prods:
            # the quantity bands this item has rates for (a screen-print item has no 501+ band, and that is not a gap)
            cells = get(f"/price-matrix-cells/?product_id={p['id']}") if p["pricing_type"] != "fixed" else []
            used_slabs = {c["quantity_slab_id"] for c in cells if c["is_active"]}
            qtys = sorted({max(s.get("min_quantity") or 1, p.get("min_quantity") or 1) for s in slabs if s["id"] in used_slabs}) or [max(p.get("min_quantity") or 1, 1)]
            if p["pricing_type"] == "fixed":
                qtys = [max(p.get("min_quantity") or 1, 1), max(p.get("min_quantity") or 1, 1) * 10]
            # what the counter must choose for this item: the drop-downs its price depends on, plus any required descriptive ones
            need = [a for a in attrs if a["id"] in (p.get("price_attribute_ids") or []) or (a["is_required"] and not a.get("in_price_matrix", True))]
            big = [50000] if p["pricing_type"] == "matrix" else []
            for combo in combos(need)[:40 if big else None]:
                for q in (qtys[:30] + big):
                    item = {"product_id": p["id"], "quantity": q, "selected_options": [{"attribute_id": a, "attribute_option_id": o} for a, o, _ in combo],
                            "extra_charge_ids": [], "sets": 1}
                    if p["pricing_type"] == "per_area":
                        item["area_sqft"] = 12.0
                    r = api("POST", "/quotations/preview", {"with_gst": False, "items": [item]}, admin())
                    entry["tested"] += 1
                    result["tested"] += 1
                    row = (r.data or {}).get("items", [{}])[0] if r.status == 200 else {}
                    label = f"{p['name']} | " + ", ".join(v for _, _, v in combo) + f" | qty {q}"
                    if r.status != 200 or not row.get("priceable"):
                        entry["failed"].append({"case": label, "why": row.get("message") or f"HTTP {r.status}"})
                        result["failed"] += 1
                    elif not row.get("total_price"):
                        entry["zero"].append(label)
                        result["failed"] += 1
                    else:
                        entry["prices"].append(row["total_price"])
        if entry["prices"]:
            entry["min_price"], entry["max_price"] = min(entry["prices"]), max(entry["prices"])
        entry["priced_ok"] = len(entry["prices"])
        del entry["prices"]
        result["services"].append(entry)
        if not quiet:
            print(f"{cat['name']:34s} items {entry['items']:3d} tested {entry['tested']:5d} ok {entry['priced_ok']:5d} unpriceable {len(entry['failed']):4d} zero {len(entry['zero']):3d}")
        for f in entry["failed"][:3] if not quiet else []:
            print("     -", f["case"][:110], "|", f["why"])
    if write:
        with open(os.path.join(os.path.dirname(__file__), "price_sweep.json"), "w", encoding="utf-8") as fh:
            json.dump(result, fh, indent=1)
    if not quiet:
        print(f"{result['tested']} combinations tested, {result['failed']} not priced")
    return result


if __name__ == "__main__":
    main(sys.argv[1:] or None)
