"""Service-by-service checks across all 14 services: rate-grid integrity and complete order scenarios."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # backend/ for the seed module

import catalog
from framework import admin, api, expect, expect_status, run


def run_all():
    import seed_uat_demo_data as demo  # specs for the demo orders + independent price recomputation

    cats = api("GET", "/product-categories/?limit=500", token=admin()).data
    products = api("GET", "/products/?limit=2000", token=admin()).data
    slabs_all = {}
    M = "Services & Rate Grid"

    # ------------------------------------------------------------------ catalogue health
    for c in sorted(cats, key=lambda x: x["name"]):
        if c["name"].startswith("ZZ"):
            continue
        prods = [p for p in products if p["category_id"] == c["id"] and p["is_active"]]
        slabs = api("GET", f"/quantity-slabs/?category_id={c['id']}", token=admin()).data
        slabs_all[c["id"]] = {s["id"]: s for s in slabs}

        def t(c=c, prods=prods):
            expect(c["is_active"], "service is switched off")
            expect(prods, "service has no active items")
            fixed_bad = [p["name"] for p in prods if p["pricing_type"] == "fixed" and not (p["fixed_price"] or 0) > 0]
            expect(not fixed_bad, f"fixed-price items with no price: {fixed_bad}")
            return f"{len(prods)} active items, none unpriced"
        run("SVC", M, f"{c['name']}: service is active and every fixed-price item has a price", "Active, items present, no Rs0 fixed prices", t)

        def t(c=c, prods=prods):
            total = zero = bad = 0
            problems = []
            inc = any(s["is_incremental"] for s in slabs_all[c["id"]].values())
            for p in prods:
                if p["pricing_type"] == "fixed":
                    continue
                cells = api("GET", f"/price-matrix-cells/?product_id={p['id']}", token=admin()).data
                for cell in cells:
                    if not cell["is_active"]:
                        continue
                    total += 1
                    if cell["unit_price"] <= 0:
                        zero += 1
                        problems.append(f"{p['name']} slab {cell['quantity_slab_id']}: Rs0")
            expect(total > 0 or all(p["pricing_type"] == "fixed" for p in prods), "no rate-grid cells at all")
            expect(zero == 0, f"{zero} of {total} cells are Rs0: {problems[:3]}")
            return f"{total} rate-grid cells, none at Rs0"
        run("SVC", M, f"{c['name']}: no rate-grid cell is left at Rs0", "All cells priced", t)

        def t(c=c, prods=prods):
            checked = mism = 0
            notes = []
            slabs = slabs_all[c["id"]]
            inc = any(s["is_incremental"] for s in slabs.values())
            if inc:
                return "Skipped bulk replay: this service uses incremental bands, covered by the order scenarios below"
            attrs = {a["id"]: a for a in api("GET", f"/attributes/?category_id={c['id']}", token=admin()).data}
            extras = {o["id"]: o["extra_price"] for a in attrs.values() for o in a["options"]}
            for p in prods:
                if p["pricing_type"] == "fixed":
                    continue
                cells_of = {p["id"]: api("GET", f"/price-matrix-cells/?product_id={p['id']}", token=admin()).data}
                for cell in cells_of[p["id"]]:
                    if not cell["is_active"]:
                        continue
                    slab = slabs[cell["quantity_slab_id"]]
                    qty = slab["min_quantity"]
                    area = 1.0 if p["pricing_type"] == "per_area" else None
                    sel = [dict(attribute_id=o["attribute_id"], attribute_option_id=o["attribute_option_id"]) for o in cell["options"]]
                    d = api("POST", "/quotations/preview", {"items": [dict(product_id=p["id"], quantity=qty, area_sqft=area, selected_options=sel, extra_charge_ids=[], sets=1)]}, admin()).data
                    it = d["items"][0]
                    grid = cell["unit_price"] * (area or 1) * qty
                    key = {(o["attribute_id"], o["attribute_option_id"]) for o in cell["options"]}
                    if not slab["is_incremental"]:
                        # a bigger order never costs less than a smaller one: held at the previous band's top quantity
                        for other in cells_of[p["id"]]:
                            prev = slabs[other["quantity_slab_id"]]
                            if (other["is_active"] and not prev["is_incremental"] and prev["max_quantity"] == slab["min_quantity"] - 1
                                    and {(o["attribute_id"], o["attribute_option_id"]) for o in other["options"]} == key):
                                grid = max(grid, other["unit_price"] * (area or 1) * prev["max_quantity"])
                    expected = grid + sum(extras.get(o["attribute_option_id"], 0) for o in cell["options"]) * qty
                    if c.get("print_charge_mode") == "block" and c.get("print_block_size") and c.get("print_block_rate"):
                        expected += max(1, -(-qty // c["print_block_size"])) * c["print_block_rate"]
                    elif c.get("print_charge_mode") == "per_copy" and c.get("print_per_copy_rate"):
                        expected += c["print_per_copy_rate"] * qty
                    if c.get("min_charge") and expected < c["min_charge"]:
                        expected = c["min_charge"]
                    checked += 1
                    if not it["priceable"] or abs(it["total_price"] - expected) > 0.05 * max(1, qty ** 0):
                        mism += 1
                        if len(notes) < 3:
                            notes.append(f"{p['name']} x{qty}: engine {it['total_price']} vs grid {expected}")
            expect(mism == 0, f"{mism} of {checked} cells disagree: {notes}")
            return f"All {checked} grid cells replayed through the live pricing engine and matched"
        run("SVC", M, f"{c['name']}: every saved rate is reproduced by the pricing engine", "Engine total = grid price x quantity for every cell", t)

    # ------------------------------------------------------------------ one complete order per service scenario
    M = "Service order scenarios"
    cust = api("POST", "/customers/", {"name": "ZZTEST Scenarios", "phone": "85" + str(os.getpid()).zfill(8)[:8] + "0"}, admin())
    cid = cust.data["id"] if cust.status == 201 else api("GET", "/customers/", token=admin()).data[0]["id"]

    for spec_row in demo.ORDERS + [(q[0], q[1], q[2], q[3], "quote", 0, 0, [], "", "", "", False) for q in demo.QUOTES]:
        key, _cust, sp, gst = spec_row[0], spec_row[1], spec_row[2], spec_row[3]

        def t(key=key, sp=sp, gst=gst):
            cat = demo.cat(sp["service"])
            prod = demo.prod(cat, sp["product"])
            expected = demo.expected_line(cat, prod, sp["qty"], sp["opts"], sp["charges"], sp.get("sets", 1), sp.get("area"))
            item = catalog.item(sp["service"], sp["product"], sp["qty"], sp["opts"], sp["charges"], sp.get("area"), sp.get("sets", 1), sp.get("notes"))
            # 1) live preview
            pv = api("POST", "/quotations/preview", {"items": [{k: item[k] for k in ("product_id", "quantity", "area_sqft", "selected_options", "extra_charge_ids", "sets")}]}, admin())
            expect_status(pv, 200)
            expect(pv.data["items"][0]["priceable"], "preview says not priceable")
            expect(abs(pv.data["subtotal"] - expected) < 0.06, f"preview Rs{pv.data['subtotal']} vs expected Rs{expected}")
            # 2) the saved order, invoice and job card
            q = api("POST", "/quotations/", {"customer_id": cid, "with_gst": gst, "is_order": True, "items": [item]}, admin())
            expect_status(q, 200, 201)
            expect(abs(q.data["total_amount"] - expected) < 0.06, f"order Rs{q.data['total_amount']} vs expected Rs{expected}")
            expect_status(api("POST", f"/quotations/{q.data['id']}/convert", token=admin()), 200, 201)
            inv = api("POST", f"/invoices/from-quotation/{q.data['id']}", token=admin())
            expect_status(inv, 200, 201)
            d = inv.data
            tax = round(expected * demo.expected_tax_rate(cat, prod) / 100, 2) if gst else 0
            expect(abs(d["subtotal"] - expected) < 0.06 and abs(d["tax_amount"] - tax) < 0.06 and abs(d["grand_total"] - (d["subtotal"] + d["tax_amount"])) < 0.02,
                   f"invoice subtotal {d['subtotal']}, tax {d['tax_amount']}, total {d['grand_total']} (expected {expected} + {tax})")
            jobs = [j for j in api("GET", "/job-cards/?limit=2000", token=admin()).data if j["quotation_item_id"] == q.data["items"][0]["id"]]
            expect(len(jobs) == 1, f"{len(jobs)} job cards")
            pdf = api("GET", f"/invoices/{d['id']}/bill-pdf", token=admin())
            expect(pdf.status == 200 and pdf.raw[:4] == b"%PDF", "bill PDF failed")
            pdf2 = api("GET", f"/invoices/{d['id']}/pdf?format=a4", token=admin())
            expect(pdf2.status == 200 and pdf2.raw[:4] == b"%PDF", "A4 invoice PDF failed")
            return f"Rs{expected:,.2f}" + (f" + GST Rs{tax:,.2f}" if gst else " (no GST)") + f" -> {d['invoice_number']}, {jobs[0]['job_number']}, bill and A4 PDFs print"
        run("SCN", M, f"{sp['service']} / {sp['product']} ({key}): price, order, invoice, job card and PDFs", "All amounts equal the independent calculation", t)
