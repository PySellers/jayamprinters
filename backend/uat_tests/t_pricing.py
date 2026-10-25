"""Catalogue set-up (services, quantity bands, attributes, rate grid, extra charges) and the pricing engine."""

import uuid

from framework import admin, api, as_role, expect, expect_status, run

TAG = uuid.uuid4().hex[:5]
M_CAT = "Pricing Setup"
M_ENG = "Pricing Engine"


def mk(path, body, token=None):
    r = api("POST", path, body, token or admin())
    expect(r.status in (200, 201), f"POST {path} -> HTTP {r.status}: {r.raw[:200]!r}")
    return r.data


def preview(items, tax_id=None):
    r = api("POST", "/quotations/preview", {"items": items, "tax_id": tax_id}, admin())
    expect_status(r, 200)
    return r.data


def line(pid, qty, opts=(), charges=(), area=None, sets=1):
    return dict(product_id=pid, quantity=qty, area_sqft=area, sets=sets,
                selected_options=[dict(attribute_id=a, attribute_option_id=o) for a, o in opts], extra_charge_ids=list(charges))


def total_of(items):
    d = preview(items)
    expect(d["items"][0]["priceable"], "line was not priceable")
    return round(d["items"][0]["total_price"], 2)


def run_all():
    ids = {"cells": [], "charges": [], "products": [], "opts": [], "attrs": [], "slabs": []}

    # ------------------------------------------------------------------ catalogue set-up
    def t():
        d = mk("/product-categories/", {"name": f"ZZ Test Service {TAG}", "is_active": True})
        ids["cat"] = d["id"]
        return f"Service #{d['id']} created"
    run("PRC", M_CAT, "Admin creates a new service (product category)", "Created", t)

    def t():
        r = api("POST", "/product-categories/", {"name": "x"}, as_role("counter"))
        expect_status(r, 403)
        return "403 Forbidden"
    run("PRC", M_CAT, "Counter user tries to create a service", "403 (admin only)", t)

    def t():
        r = api("GET", "/product-categories/", token=as_role("counter"))
        expect_status(r, 200)
        names = [c["name"] for c in r.data]
        expect(len(r.data) >= 14, f"only {len(r.data)} services")
        return f"{len(r.data)} services visible to counter staff"
    run("PRC", M_CAT, "Counter user can view the services list", "200 with all 14+ services", t)

    def t():
        cat = ids["cat"]
        for lo, hi, inc in ((1, 99, False), (100, 499, False), (500, None, False)):
            d = mk("/quantity-slabs/", {"category_id": cat, "min_quantity": lo, "max_quantity": hi, "label": f"{lo}-{hi or 'above'}", "display_order": lo, "is_incremental": inc})
            ids["slabs"].append(d["id"])
        r = api("GET", f"/quantity-slabs/?category_id={cat}", token=admin())
        expect(len(r.data) == 3, "3 slabs expected")
        return "3 quantity bands (1-99, 100-499, 500+) created"
    run("PRC", M_CAT, "Admin adds quantity bands to the service", "3 bands created and listed", t)

    def t():
        cat = ids["cat"]
        a = mk("/attributes/", {"category_id": cat, "name": "Size", "is_required": True, "display_order": 1, "is_active": True, "in_price_matrix": True})
        ids["size"] = a["id"]
        ids["attrs"].append(a["id"])
        for v in ("A4", "A3", "A5"):
            o = mk(f"/attributes/{a['id']}/options", {"value": v, "extra_price": 0, "display_order": 1, "is_active": True})
            ids[v] = o["id"]
            ids["opts"].append(o["id"])
        b = mk("/attributes/", {"category_id": cat, "name": "Paper", "is_required": False, "display_order": 2, "is_active": True, "in_price_matrix": False})
        ids["paper"] = b["id"]
        ids["attrs"].append(b["id"])
        for v, extra in (("Plain", 0), ("Gold", 2.0)):
            o = mk(f"/attributes/{b['id']}/options", {"value": v, "extra_price": extra, "display_order": 1, "is_active": True})
            ids[v] = o["id"]
            ids["opts"].append(o["id"])
        return "Attributes Size (A4/A3/A5, in price grid) and Paper (Plain / Gold +Rs2) created"
    run("PRC", M_CAT, "Admin adds attributes and options (size, paper)", "Attributes and options created", t)

    def t():
        p = mk("/products/", {"name": f"ZZ Matrix Item {TAG}", "category_id": ids["cat"], "pricing_type": "matrix", "is_active": True})
        ids["pm"] = p["id"]
        ids["products"].append(p["id"])
        return f"Product #{p['id']} (price-grid item) created"
    run("PRC", M_CAT, "Admin adds a price-grid item to the service", "Created", t)

    def t():
        grid = {("A4", 0): 10, ("A4", 1): 8, ("A4", 2): 6, ("A3", 0): 20, ("A3", 1): 16, ("A3", 2): 12}
        cells = [dict(product_id=ids["pm"], quantity_slab_id=ids["slabs"][si], unit_price=price, is_active=True,
                      options=[dict(attribute_id=ids["size"], attribute_option_id=ids[size])]) for (size, si), price in grid.items()]
        r = api("POST", "/price-matrix-cells/bulk", {"cells": cells}, admin())
        expect_status(r, 200, 201)
        lst = api("GET", f"/price-matrix-cells/?product_id={ids['pm']}", token=admin())
        expect(len(lst.data) == 6, f"{len(lst.data)} cells (6 expected)")
        ids["cells"] = [c["id"] for c in lst.data]
        return "6 rate-grid cells saved in one bulk upsert"
    run("PRC", M_CAT, "Admin fills the rate grid (bulk save, 2 sizes x 3 bands)", "6 cells stored", t)

    def t():
        r = api("POST", "/price-matrix-cells/bulk", {"cells": [dict(product_id=ids["pm"], quantity_slab_id=ids["slabs"][0], unit_price=11, is_active=True,
                                                                  options=[dict(attribute_id=ids["size"], attribute_option_id=ids["A4"])])]}, admin())
        expect_status(r, 200, 201)
        lst = api("GET", f"/price-matrix-cells/?product_id={ids['pm']}", token=admin())
        expect(len(lst.data) == 6, f"bulk save created a duplicate ({len(lst.data)} cells)")
        a4_small = [c for c in lst.data if c["quantity_slab_id"] == ids["slabs"][0] and ids["A4"] in [o["attribute_option_id"] for o in c["options"]]][0]
        expect(a4_small["unit_price"] == 11, "price not updated")
        api("PUT", f"/price-matrix-cells/{a4_small['id']}", {"unit_price": 10}, admin())
        return "Re-saving the same cell updates it (no duplicate)"
    run("PRC", M_CAT, "Saving the grid again updates cells instead of duplicating", "Still 6 cells, price updated", t)

    # ------------------------------------------------------------------ pricing engine
    def t():
        tot = total_of([line(ids["pm"], 50, [(ids["size"], ids["A4"])])])
        expect(tot == 500, f"got {tot}")
        return "50 x Rs10 = Rs500"
    run("ENG", M_ENG, "Price a quantity inside the first band", "50 A4 = Rs500 (Rs10 each)", t)

    # A bigger order never costs less than a smaller one: at the start of a cheaper band the total is held at the
    # previous band's top quantity at that band's rate (99 x Rs10 = Rs990, 499 x Rs8 = Rs3,992, 99 x Rs20 = Rs1,980).
    for qty, size, expected, label in ((99, "A4", 990, "last unit of band 1"), (100, "A4", 990, "first unit of band 2 - held at the band-1 total"),
                                       (150, "A4", 1200, "inside band 2, above the held total"), (499, "A4", 3992, "last unit of band 2"),
                                       (500, "A4", 3992, "first unit of band 3 - held at the band-2 total"), (5000, "A4", 30000, "very large quantity"),
                                       (100, "A3", 1980, "different size A3 - held at the band-1 total")):
        def t(qty=qty, size=size, expected=expected):
            tot = total_of([line(ids["pm"], qty, [(ids["size"], ids[size])])])
            expect(abs(tot - expected) < 0.01, f"got {tot}, expected {expected}")
            return f"{qty} x {size} = Rs{expected}"
        run("ENG", M_ENG, f"Band boundary: {qty} x {size} ({label})", f"Rs{expected}", t)

    def t():
        last = 0
        for qty in range(1, 700):
            tot = total_of([line(ids["pm"], qty, [(ids["size"], ids["A4"])])])
            expect(tot >= last - 0.005, f"{qty} pieces cost Rs{tot}, less than {qty - 1} pieces (Rs{last})")
            last = tot
        return "Checked every quantity from 1 to 699: the total never goes down"
    run("ENG", M_ENG, "More pieces never cost less than fewer pieces", "Total never decreases as quantity grows", t)

    def t():
        tot = total_of([line(ids["pm"], 200, [(ids["size"], ids["A3"]), (ids["paper"], ids["Gold"])])])
        expect(abs(tot - 200 * 18) < 0.01, f"got {tot}")
        return "Rs16 grid price + Rs2 Gold surcharge = Rs18 x 200"
    run("ENG", M_ENG, "Option surcharge (Gold paper +Rs2 per piece)", "200 A3 Gold = Rs3,600", t)

    def t():
        d = preview([line(ids["pm"], 50, [(ids["size"], ids["A5"])])])
        expect(d["items"][0]["priceable"] is False, "A5 has no price but was priced")
        return "Marked 'not priceable' instead of inventing a price"
    run("ENG", M_ENG, "Combination with no rate in the grid (A5)", "Not priceable (no guessed price)", t)

    def t():
        r = api("POST", "/quotations/", {"customer_id": _any_customer(), "items": [dict(product_id=ids["pm"], quantity=50, selected_options=[dict(attribute_id=ids["size"], attribute_option_id=ids["A5"])])]}, admin())
        expect_status(r, 400)
        return "400 'No price matrix entry...' - cannot save an unpriced line"
    run("ENG", M_ENG, "Try to save an order for an un-priced combination", "Rejected with 400", t)

    def t():
        r = api("POST", "/quotations/", {"customer_id": _any_customer(), "items": [dict(product_id=ids["pm"], quantity=50, selected_options=[])]}, admin())
        expect_status(r, 400)
        return "400 returned (required Size missing)"
    run("ENG", M_ENG, "Save an order without choosing the required Size", "Rejected with 400", t)

    for qty in (0, -5):
        def t(qty=qty):
            r = api("POST", "/quotations/", {"customer_id": _any_customer(), "items": [dict(product_id=ids["pm"], quantity=qty, selected_options=[dict(attribute_id=ids["size"], attribute_option_id=ids["A4"])])]}, admin())
            expect(r.status in (400, 422), f"HTTP {r.status} - a quantity of {qty} was accepted")
            return f"HTTP {r.status} - rejected"
        run("ENG", M_ENG, f"Order with quantity {qty}", "Rejected", t)

    # extra charges
    def charge(name, ctype, amount, **kw):
        d = mk("/extra-charges/", dict(category_id=ids["cat"], name=name, charge_type=ctype, amount=amount, is_active=True, **kw))
        ids["charges"].append(d["id"])
        return d["id"]

    def t():
        flat = charge("Design charge", "flat", 300)
        tot = total_of([line(ids["pm"], 200, [(ids["size"], ids["A4"])], [flat])])
        expect(abs(tot - 1900) < 0.01, f"got {tot}")
        return "Rs1,600 + flat Rs300 = Rs1,900"
    run("ENG", M_ENG, "Flat extra charge (design Rs300)", "200 A4 + Rs300 = Rs1,900", t)

    def t():
        pu = charge("Lamination per piece", "per_unit", 1.5)
        tot = total_of([line(ids["pm"], 200, [(ids["size"], ids["A4"])], [pu])])
        expect(abs(tot - 1900) < 0.01, f"got {tot}")
        return "Rs1,600 + 200 x Rs1.5 = Rs1,900"
    run("ENG", M_ENG, "Per-piece extra charge (Rs1.5 each)", "200 A4 + Rs300 = Rs1,900", t)

    def t():
        pc = charge("Rush 10%", "percentage", 10)
        tot = total_of([line(ids["pm"], 200, [(ids["size"], ids["A4"])], [pc])])
        expect(abs(tot - 1760) < 0.01, f"got {tot}")
        return "Rs1,600 + 10% = Rs1,760"
    run("ENG", M_ENG, "Percentage extra charge (10%)", "200 A4 + 10% = Rs1,760", t)

    def t():
        ps = charge("Binding per set", "per_set", 25)
        tot = total_of([line(ids["pm"], 200, [(ids["size"], ids["A4"])], [ps], sets=4)])
        expect(abs(tot - 1700) < 0.01, f"got {tot}")
        return "Rs1,600 + 4 sets x Rs25 = Rs1,700"
    run("ENG", M_ENG, "Per-set extra charge (4 sets x Rs25)", "200 A4 + Rs100 = Rs1,700", t)

    def t():
        a = charge("Stitch", "flat", 10, group_name="Binding")
        b = charge("Spiral", "flat", 20, group_name="Binding")
        r = api("POST", "/quotations/", {"customer_id": _any_customer(), "items": [dict(product_id=ids["pm"], quantity=100, extra_charge_ids=[a, b],
                                                                                         selected_options=[dict(attribute_id=ids["size"], attribute_option_id=ids["A4"])])]}, admin())
        expect_status(r, 400)
        expect("Only one" in r.raw.decode(), "message does not explain the rule")
        return "400 'Only one Binding can be chosen'"
    run("ENG", M_ENG, "Pick two charges from the same single-choice group", "Rejected with a clear message", t)

    def t():
        dep = charge("Gold foil (needs Gold paper)", "flat", 50, requires_option_id=ids["Gold"])
        bad = api("POST", "/quotations/", {"customer_id": _any_customer(), "items": [dict(product_id=ids["pm"], quantity=100, extra_charge_ids=[dep],
                                                                                         selected_options=[dict(attribute_id=ids["size"], attribute_option_id=ids["A4"])])]}, admin())
        expect_status(bad, 400)
        tot = total_of([line(ids["pm"], 200, [(ids["size"], ids["A3"]), (ids["paper"], ids["Gold"])], [dep])])
        expect(abs(tot - 3650) < 0.01, f"got {tot}")
        return "Refused without Gold paper; Rs3,600 + Rs50 = Rs3,650 with it"
    run("ENG", M_ENG, "Dependent charge needs its option", "Refused without the option, accepted with it", t)

    # fixed / per-area / minimum / incremental
    def t():
        p = mk("/products/", {"name": f"ZZ Fixed {TAG}", "category_id": ids["cat"], "pricing_type": "fixed", "fixed_price": 25, "is_active": True})
        ids["products"].append(p["id"])
        tot = total_of([line(p["id"], 4)])
        expect(tot == 100, f"got {tot}")
        return "4 x Rs25 = Rs100"
    run("ENG", M_ENG, "Fixed-price item (Rs25 each)", "4 pieces = Rs100", t)

    def t():
        p = mk("/products/", {"name": f"ZZ NoPrice {TAG}", "category_id": ids["cat"], "pricing_type": "fixed", "is_active": True})
        ids["products"].append(p["id"])
        r = api("POST", "/quotations/", {"customer_id": _any_customer(), "items": [dict(product_id=p["id"], quantity=1)]}, admin())
        expect_status(r, 400)
        return "400 'Product has no fixed price configured'"
    run("ENG", M_ENG, "Fixed-price item with no price entered", "Refused rather than billing Rs0", t)

    def t():
        p = mk("/products/", {"name": f"ZZ Area {TAG}", "category_id": ids["cat"], "pricing_type": "per_area", "is_active": True})
        ids["products"].append(p["id"])
        ids["parea"] = p["id"]
        for sl in ids["slabs"]:
            mk("/price-matrix-cells/", dict(product_id=p["id"], quantity_slab_id=sl, unit_price=12, is_active=True, options=[dict(attribute_id=ids["size"], attribute_option_id=ids["A4"])]))
        tot = total_of([line(p["id"], 2, [(ids["size"], ids["A4"])], area=10)])
        expect(abs(tot - 240) < 0.01, f"got {tot}")
        return "Rs12/sq ft x 10 sq ft x 2 = Rs240"
    run("ENG", M_ENG, "Per-area item (banner: Rs12 per sq ft)", "2 pieces of 10 sq ft = Rs240", t)

    def t():
        d = api("PUT", f"/product-categories/{ids['cat']}", {"min_charge": 300}, admin())
        expect_status(d, 200)
        tot = total_of([line(ids["pm"], 10, [(ids["size"], ids["A4"])])])
        big = total_of([line(ids["pm"], 200, [(ids["size"], ids["A4"])])])
        expect(abs(tot - 300) < 0.01 and abs(big - 1600) < 0.01, f"small {tot}, big {big}")
        api("PUT", f"/product-categories/{ids['cat']}", {"min_charge": None}, admin())
        return "Rs100 job lifted to the Rs300 minimum; Rs1,600 job unchanged"
    run("ENG", M_ENG, "Minimum charge per line (Rs300)", "Small jobs billed at the minimum, big jobs unaffected", t)

    def t():
        inc = mk("/quantity-slabs/", {"category_id": ids["cat"], "min_quantity": 1000, "max_quantity": None, "label": "bulk", "display_order": 9, "is_incremental": False})
        ids["slabs"].append(inc["id"])
        for sl, lo, hi, price in ((ids["slabs"][0], 1, 99, 10), (ids["slabs"][1], 100, 499, 8)):
            api("PUT", f"/quantity-slabs/{sl}", {"is_incremental": True}, admin())
        tot = total_of([line(ids["pm"], 150, [(ids["size"], ids["A4"])])])
        # 99 units at Rs10 (band 1) + 51 units at Rs8 (band 2)? depends on band edges - compare with the model: band1 = 1..99
        expected = 99 * 10 + 51 * 8
        expect(abs(tot - expected) < 0.05, f"got {tot}, expected {expected}")
        for sl in ids["slabs"][:2]:
            api("PUT", f"/quantity-slabs/{sl}", {"is_incremental": False}, admin())
        return f"Incremental bands: 99 x Rs10 + 51 x Rs8 = Rs{expected}"
    run("ENG", M_ENG, "Incremental (slab) pricing - each band prices only its own units", "150 pieces = 99 at Rs10 + 51 at Rs8", t)

    # GST
    def t():
        tid = [x for x in api("GET", "/taxes/", token=admin()).data if x["is_default"]][0]
        d = preview([line(ids["pm"], 200, [(ids["size"], ids["A4"])])])
        expect(d["subtotal"] == 1600, d)
        expect(abs(d["tax_amount"] - 288) < 0.01 and abs(d["grand_total"] - 1888) < 0.01, f"tax {d['tax_amount']} total {d['grand_total']}")
        return f"Rs1,600 + {tid['rate_percent']}% GST Rs288 = Rs1,888"
    run("ENG", M_ENG, "GST added at the default tax rate", "Rs1,600 -> tax Rs288 -> Rs1,888", t)

    # edit & deactivate cells
    def t():
        cell = [c for c in api("GET", f"/price-matrix-cells/?product_id={ids['pm']}", token=admin()).data
                if c["quantity_slab_id"] == ids["slabs"][1] and ids["A4"] in [o["attribute_option_id"] for o in c["options"]]][0]
        api("PUT", f"/price-matrix-cells/{cell['id']}", {"unit_price": 9}, admin())
        tot = total_of([line(ids["pm"], 200, [(ids["size"], ids["A4"])])])
        expect(abs(tot - 1800) < 0.01, f"got {tot}")
        api("PUT", f"/price-matrix-cells/{cell['id']}", {"unit_price": 8}, admin())
        api("PUT", f"/price-matrix-cells/{cell['id']}", {"is_active": False}, admin())
        d = preview([line(ids["pm"], 100, [(ids["size"], ids["A4"])])])
        expect(d["items"][0]["priceable"] is False, "deactivated cell still priced")
        api("PUT", f"/price-matrix-cells/{cell['id']}", {"is_active": True}, admin())
        return "Price change applies instantly; deactivated cell stops pricing; restored"
    run("ENG", M_ENG, "Edit a price, then switch a cell off and on", "New price used at once; inactive cell not used", t)

    def t():
        r = api("PUT", f"/attributes/options/{ids['Gold']}", {"extra_price": 5}, admin())
        expect_status(r, 200)
        tot = total_of([line(ids["pm"], 200, [(ids["size"], ids["A3"]), (ids["paper"], ids["Gold"])])])
        api("PUT", f"/attributes/options/{ids['Gold']}", {"extra_price": 2}, admin())
        expect(abs(tot - 4200) < 0.01, f"got {tot}")
        return "Surcharge Rs2 -> Rs5 changed 3,600 to 4,200, then restored"
    run("PRC", M_CAT, "Edit an option's surcharge", "Surcharge change flows into the price", t)

    def t():
        r = api("PUT", f"/extra-charges/{ids['charges'][0]}", {"amount": 400}, admin())
        expect_status(r, 200)
        tot = total_of([line(ids["pm"], 200, [(ids["size"], ids["A4"])], [ids["charges"][0]])])
        api("PUT", f"/extra-charges/{ids['charges'][0]}", {"amount": 300}, admin())
        expect(abs(tot - 2000) < 0.01, f"got {tot}")
        return "Charge Rs300 -> Rs400 changed 1,900 to 2,000, then restored"
    run("PRC", M_CAT, "Edit an extra charge amount", "New amount used in the price", t)

    def t():
        r = api("PUT", f"/extra-charges/{ids['charges'][0]}", {"is_active": False}, admin())
        expect_status(r, 200)
        bad = api("POST", "/quotations/", {"customer_id": _any_customer(), "items": [dict(product_id=ids["pm"], quantity=100, extra_charge_ids=[ids["charges"][0]],
                                                                                         selected_options=[dict(attribute_id=ids["size"], attribute_option_id=ids["A4"])])]}, admin())
        api("PUT", f"/extra-charges/{ids['charges'][0]}", {"is_active": True}, admin())
        expect(bad.status == 400 or bad.status == 404 or (bad.data and abs(bad.data["total_amount"] - 800) < 0.01),
               f"deactivated charge still billed (HTTP {bad.status})")
        return f"Inactive charge is not billed (HTTP {bad.status})"
    run("PRC", M_CAT, "Switch an extra charge off", "It is no longer billed", t)

    # permissions for catalogue editing
    for what, path, body in (("service", "/product-categories/", {"name": "n"}), ("quantity band", "/quantity-slabs/", {"category_id": 1, "min_quantity": 1}),
                             ("attribute", "/attributes/", {"category_id": 1, "name": "n"}), ("product", "/products/", {"name": "n"}),
                             ("price cell", "/price-matrix-cells/", {"product_id": 1, "quantity_slab_id": 1, "unit_price": 1}),
                             ("extra charge", "/extra-charges/", {"name": "n", "charge_type": "flat", "amount": 1})):
        for role in ("counter", "accounts", "production"):
            def t(path=path, body=body, role=role):
                expect_status(api("POST", path, body, as_role(role)), 403)
                return "403 Forbidden"
            run("PRC", M_CAT, f"{role.title()} user tries to create a {what}", "403 (admin only)", t)

    # cleanup (and test deleting)
    def t():
        for cid in list(ids["charges"]):
            expect_status(api("DELETE", f"/extra-charges/{cid}", token=admin()), 204, 200)
        return f"{len(ids['charges'])} extra charges deleted"
    run("PRC", M_CAT, "Admin deletes extra charges", "Deleted", t)

    def t():
        for pid in ids["products"]:
            r = api("DELETE", f"/products/{pid}", token=admin())
            expect_status(r, 204, 200)
        gone = api("GET", f"/products/{ids['products'][0]}", token=admin())
        expect_status(gone, 404)
        return "Items (and their rate-grid cells) deleted"
    run("PRC", M_CAT, "Admin deletes items (cells go with them)", "Deleted; lookup gives 404", t)

    def t():
        for oid in ids["opts"]:
            expect_status(api("DELETE", f"/attributes/options/{oid}", token=admin()), 204, 200)
        for aid in ids["attrs"]:
            expect_status(api("DELETE", f"/attributes/{aid}", token=admin()), 204, 200)
        return "Options and attributes deleted"
    run("PRC", M_CAT, "Admin deletes attribute options and attributes", "Deleted", t)

    def t():
        for sid in ids["slabs"]:
            expect_status(api("DELETE", f"/quantity-slabs/{sid}", token=admin()), 204, 200)
        return "Quantity bands deleted"
    run("PRC", M_CAT, "Admin deletes quantity bands", "Deleted", t)

    def t():
        expect_status(api("DELETE", f"/product-categories/{ids['cat']}", token=admin()), 204, 200)
        expect_status(api("GET", f"/product-categories/{ids['cat']}", token=admin()), 404)
        return "Service deleted"
    run("PRC", M_CAT, "Admin deletes the test service", "Deleted; lookup gives 404", t)


_cust = {}


def _any_customer():
    if "id" not in _cust:
        r = api("GET", "/customers/", token=admin())
        _cust["id"] = r.data[0]["id"]
    return _cust["id"]
