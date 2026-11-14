"""Round 7: every service has a price. For each service every combination of the options its price depends on, at every quantity band
(and a big order), is priced through the same engine the order screen uses; items priced by fewer drop-downs than the service has
are not blocked; the first band, the open top band, the minimum order, GST and "a bigger order never costs less" are checked."""

import itertools

from framework import admin, api, expect, expect_status, run
import price_sweep

M_ALL = "Round 7 - Every service is priced"
M_ENG = "Round 7 - Pricing engine rules"
GST_NOTE = {}


def get(path):
    r = api("GET", path, token=admin())
    expect_status(r, 200)
    return r.data


def preview(items, gst=False, **extra):
    r = api("POST", "/quotations/preview", {"with_gst": gst, "items": items, **extra}, admin())
    expect_status(r, 200)
    return r.data


def first_combo(product, attrs):
    need = [a for a in attrs if a["id"] in (product.get("price_attribute_ids") or []) or (a["is_required"] and not a.get("in_price_matrix", True))]
    return [{"attribute_id": a["id"], "attribute_option_id": next(o["id"] for o in a["options"] if o["is_active"])} for a in need]


def run_all():
    cats = [c for c in get("/product-categories/?limit=500") if c["is_active"] and not c["name"].startswith("ZZ")]
    products = get("/products/?limit=5000")

    # ================================================================== one test per service: everything is priced
    for cat in cats:
        def t(cat=cat):
            res = price_sweep.main([cat["name"]], quiet=True, write=False)
            svc = res["services"][0]
            expect(svc["tested"] > 0, "nothing tested")
            if svc["failed"]:
                raise AssertionError(f"{len(svc['failed'])} combinations have no price, e.g. {svc['failed'][0]['case']} ({svc['failed'][0]['why']})")
            if svc["zero"]:
                raise AssertionError(f"{len(svc['zero'])} combinations price at Rs.0, e.g. {svc['zero'][0]}")
            return f"{svc['items']} item(s), {svc['tested']} combinations priced, from Rs.{svc['min_price']:,.2f} to Rs.{svc['max_price']:,.2f}"
        run("R7P", M_ALL, f"{cat['name']}: every option combination at every quantity band has a price (> Rs.0)", "No unpriced or Rs.0 combination", t)

    # ================================================================== a bigger order never costs less, per service
    for cat in cats:
        def t(cat=cat):
            attrs = get(f"/attributes/?category_id={cat['id']}")
            out = []
            for p in [x for x in products if x["category_id"] == cat["id"] and x["is_active"] and x["pricing_type"] != "fixed"][:6]:
                totals = []
                for q in sorted({max(p.get("min_quantity") or 1, v) for v in (1, 50, 100, 500, 1000, 5000, 20000)}):
                    item = {"product_id": p["id"], "quantity": q, "selected_options": first_combo(p, attrs), "extra_charge_ids": []}
                    if p["pricing_type"] == "per_area":
                        item["area_sqft"] = 6.0
                    row = preview([item])["items"][0]
                    if row["priceable"]:
                        totals.append((q, row["total_price"]))
                for (qa, ta), (qb, tb) in zip(totals, totals[1:]):
                    expect(tb + 0.01 >= ta, f"{p['name']}: {qb} costs Rs.{tb} but {qa} costs Rs.{ta}")
                out.append(f"{p['name']} {len(totals)} qty")
            expect(out or not [x for x in products if x["category_id"] == cat["id"] and x["pricing_type"] != "fixed"], "nothing to check")
            return "Totals never fall as the quantity grows: " + "; ".join(out) if out else "Fixed-price items only: one price per item"
        run("R7M", M_ALL, f"{cat['name']}: a bigger order never costs less than a smaller one", "Non-decreasing totals", t)

    # ================================================================== engine rules
    def t():
        binding = next(c for c in cats if c["name"] == "Binding Services")
        attrs = get(f"/attributes/?category_id={binding['id']}")
        project = next(p for p in products if p["category_id"] == binding["id"] and p["name"] == "Project Binding")
        expect(len(project["price_attribute_ids"]) == 1, project["price_attribute_ids"])
        # the screen asks for both drop-downs; the item is priced by its material only
        both = [{"attribute_id": a["id"], "attribute_option_id": a["options"][0]["id"]} for a in attrs if a["is_required"]]
        row = preview([{"product_id": project["id"], "quantity": 5, "selected_options": both, "extra_charge_ids": []}])["items"][0]
        expect(row["priceable"] and row["total_price"] > 0, row)
        return f"Project Binding x5 = Rs.{row['total_price']:,.2f} although a wrapper print type was also chosen"
    run("R7E", M_ENG, "Binding Services: an item is priced by what its rates use, other drop-downs do not block the price", "Priceable with both drop-downs chosen", t)

    def t():
        covers = next(c for c in cats if c["name"] == "Book Covers")
        attrs = get(f"/attributes/?category_id={covers['id']}")
        prods = [p for p in products if p["category_id"] == covers["id"] and p["is_active"]]
        for p in prods:
            sel = [{"attribute_id": a["id"], "attribute_option_id": a["options"][0]["id"]} for a in attrs if a["is_required"]]
            q = max(p.get("min_quantity") or 1, 1)
            row = preview([{"product_id": p["id"], "quantity": q, "selected_options": sel, "extra_charge_ids": []}])["items"][0]
            expect(row["priceable"] and row["total_price"] > 0, f"{p['name']}: {row}")
        return f"All {len(prods)} book cover items are priced with paper AND size chosen"
    run("R7E", M_ENG, "Book Covers: paper and size both chosen, every cover item is still priced", "All 4 items priceable", t)

    def t():
        res = {}
        for name, expected_min in (("Register", 32), ("Transfer Certificate", 50), ("Visiting Card", 50)):
            cat = next(c for c in cats if c["name"] == name)
            p = next(x for x in products if x["category_id"] == cat["id"] and x["is_active"])
            expect(p["min_quantity"] == expected_min, f"{name} minimum is {p['min_quantity']}")
            attrs = get(f"/attributes/?category_id={cat['id']}")
            item = {"product_id": p["id"], "quantity": p["min_quantity"], "selected_options": first_combo(p, attrs), "extra_charge_ids": []}
            row = preview([item])["items"][0]
            expect(row["priceable"] and row["total_price"] > 0, f"{name} at its minimum: {row}")
            below = preview([{**item, "quantity": max(p["min_quantity"] - 1, 1)}])["items"][0]
            expect(not below["priceable"] and "minimum order" in (below.get("message") or ""), f"{name} below the minimum: {below}")
            res[name] = p["min_quantity"]
        return "Order starts at the minimum that has a price: " + ", ".join(f"{k} {v}" for k, v in res.items()) + "; below it the screen says 'minimum order'"
    run("R7E", M_ENG, "Items whose first rate band starts above 1 carry that as the minimum order", "min_quantity set; priced at the minimum", t)

    def t():
        reg = next(c for c in cats if c["name"] == "Register")
        p = next(x for x in products if x["category_id"] == reg["id"])
        attrs = get(f"/attributes/?category_id={reg['id']}")
        sel = first_combo(p, attrs)
        small = preview([{"product_id": p["id"], "quantity": 1000, "selected_options": sel, "extra_charge_ids": []}])["items"][0]
        huge = preview([{"product_id": p["id"], "quantity": 100000, "selected_options": sel, "extra_charge_ids": []}])["items"][0]
        expect(small["priceable"] and huge["priceable"] and huge["total_price"] >= small["total_price"], (small, huge))
        slabs = get(f"/quantity-slabs/?category_id={reg['id']}")
        expect(any(s["max_quantity"] is None for s in slabs), "no open-ended band")
        return f"1,000 = Rs.{small['total_price']:,.2f}; 100,000 = Rs.{huge['total_price']:,.2f} (open top band)"
    run("R7E", M_ENG, "A very large order is priced too (open-ended top band)", "Priced; total not lower", t)

    def t():
        cat = next(c for c in cats if c["name"] == "Visiting Card")
        p = next(x for x in products if x["category_id"] == cat["id"])
        attrs = get(f"/attributes/?category_id={cat['id']}")
        extras = [c for c in get(f"/extra-charges/?category_id={cat['id']}") if c["is_active"]]
        item = {"product_id": p["id"], "quantity": 100, "selected_options": first_combo(p, attrs), "extra_charge_ids": []}
        with_gst = preview([item], gst=True)
        cash = preview([item], gst=False)
        expect(abs(with_gst["subtotal"] + with_gst["tax_amount"] - with_gst["grand_total"]) < 0.02 and with_gst["tax_amount"] > 0, with_gst)
        expect(cash["tax_amount"] == 0 and cash["grand_total"] == cash["subtotal"], cash)
        row = with_gst["items"][0]
        parts = round(sum(b["amount"] for b in row["breakdown"]), 2)
        expect(abs(parts - row["total_price"]) < 0.02, f"parts {parts} vs line {row['total_price']}")
        expect(all(b["label"] and b["kind"] and "area" in b for b in row["breakdown"]), row["breakdown"])
        disc = preview([item], gst=True, discount_type="percent", discount_value=10)
        expect(disc["discount_amount"] > 0 and disc["grand_total"] < with_gst["grand_total"], disc)
        return f"Rs.{with_gst['subtotal']} + GST Rs.{with_gst['tax_amount']} = Rs.{with_gst['grand_total']}; parts add up to the line; 10 % discount -> Rs.{disc['grand_total']}"
    run("R7E", M_ENG, "The price parts add up to the line total; GST and discount are applied on top", "Parts = line; sub-total + GST = grand total", t)

    def t():
        xerox = next(c for c in cats if c["name"] == "Xerox / Photocopy")
        charges = {c["name"]: c for c in get(f"/extra-charges/?category_id={xerox['id']}")}
        for name in ("Rexine Binding", "Tape Binding", "Pin Binding"):
            expect(charges[name]["amount"] > 0, f"{name} still at Rs.0")
        return "Rexine Rs." + str(charges["Rexine Binding"]["amount"]) + ", Tape Rs." + str(charges["Tape Binding"]["amount"]) + ", Pin Rs." + str(charges["Pin Binding"]["amount"]) + " per set"
    run("R7E", M_ENG, "The new Xerox binding options carry a starting price", "Rates above Rs.0", t)

    def t():
        zero = []
        for c in get("/extra-charges/?limit=2000"):
            if c["is_active"] and (c["amount"] or 0) <= 0 and not any(w in c["name"] for w in ("None", "Custom", "Nil", "Single Bill", "Normal", "1 Color", "White Paper", "Loose Sheet", "Top Binding")):
                zero.append(c["name"])
        expect(not zero, "extras still at Rs.0: " + ", ".join(zero[:6]))
        return "Every extra charge has a rate, except the 'none / custom / normal' choices that are free by design"
    run("R7E", M_ENG, "No real extra charge is left at Rs.0", "Only free-by-design choices at Rs.0", t)
