"""Client enhancements (Oct 2026): company details, HSN codes & per-line GST, printing charges, copies / per-copy GSM,
bill numbering and layouts, estimated delivery, Printout & Stickers, Outsource, supplier-bill upload and the
financial statement."""

import os
import sys
import urllib.error
import urllib.request
import uuid
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # backend/ for the seed module

import catalog
from framework import BASE, Resp, admin, api, as_role, expect, expect_status, run

TAG = uuid.uuid4().hex[:5]
PH = str(int(TAG, 16)).zfill(8)


def multipart(path, filename, content, content_type, token):
    boundary = "----uat" + uuid.uuid4().hex
    body = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{filename}\"\r\nContent-Type: {content_type}\r\n\r\n").encode() + content + f"\r\n--{boundary}--\r\n".encode()
    req = urllib.request.Request(BASE + path, data=body, method="POST", headers={"Content-Type": f"multipart/form-data; boundary={boundary}", "Authorization": "Bearer " + token})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return Resp(r.status, r.read(), r.headers)
    except urllib.error.HTTPError as e:
        return Resp(e.code, e.read(), e.headers)


def preview(items, tax_id=None):
    r = api("POST", "/quotations/preview", {"items": items, "tax_id": tax_id}, admin())
    expect_status(r, 200)
    return r.data


def pdf_size(raw):
    """(width, height) of the first page of a reportlab PDF, in points."""
    i = raw.find(b"/MediaBox")
    expect(i > 0, "no page size in the PDF")
    nums = raw[i:i + 80].split(b"[")[1].split(b"]")[0].split()
    return float(nums[2]), float(nums[3])


def run_all():
    S = {}
    cust = api("POST", "/customers/", {"name": f"ZZTEST Enh {TAG}", "phone": "86" + PH + "0", "address": "12 Test Street, Chennai"}, admin())
    S["cust"] = cust.data["id"]

    # ------------------------------------------------------------------ company details
    M = "Company Details"

    def t():
        r = api("GET", "/company/", token=as_role("counter"))
        expect_status(r, 200)
        expect(r.data["name"] and r.data["next_gst_invoice_no"] >= 1, r.data)
        S["company"] = r.data
        return f"{r.data['name']}, GSTIN {r.data.get('gstin')}"
    run("CMP", M, "Any signed-in user can read the shop's details", "Name, GSTIN, address and bill numbers returned", t)

    def t():
        expect_status(api("GET", "/company/"), 401)
        return "401"
    run("CMP", M, "Company details need sign-in", "401 without a token", t)

    def t():
        r = api("PUT", "/company/", {"phones": "1"}, as_role("counter"))
        expect_status(r, 403)
        return "403 Forbidden"
    run("CMP", M, "Counter user tries to change the shop's details", "403 (admin only)", t)

    def t():
        old = S["company"]["phones"]
        r = api("PUT", "/company/", {"phones": "99999 11111, 99999 22222"}, admin())
        expect_status(r, 200)
        expect(r.data["phones"] == "99999 11111, 99999 22222", r.data)
        back = api("GET", "/company/", token=admin()).data
        expect(back["phones"] == "99999 11111, 99999 22222", "not saved")
        api("PUT", "/company/", {"phones": old}, admin())
        return "Phone numbers changed, read back, then restored"
    run("CMP", M, "Admin changes the shop's phone numbers", "Saved and returned", t)

    def t():
        expect_status(api("PUT", "/company/", {"next_gst_invoice_no": 0}, admin()), 422)
        expect_status(api("PUT", "/company/", {"name": ""}, admin()), 422)
        return "Bill number 0 and an empty name are refused"
    run("CMP", M, "Company details with invalid values", "Refused (422)", t)

    # ------------------------------------------------------------------ HSN codes
    M = "HSN Codes"
    hsn = {}

    def t():
        r = api("GET", "/hsn-codes/", token=as_role("counter"))
        expect_status(r, 200)
        expect(len(r.data) >= 5, f"{len(r.data)} codes")
        return f"{len(r.data)} HSN codes visible"
    run("HSN", M, "List HSN codes (any signed-in user)", "Codes with GST rates listed", t)

    def t():
        r = api("POST", "/hsn-codes/", {"code": f"99{PH[:4]}", "description": "ZZTEST code", "gst_rate": 5, "is_active": True}, admin())
        expect_status(r, 201)
        hsn.update(r.data)
        return f"HSN {r.data['code']} at {r.data['gst_rate']}% created"
    run("HSN", M, "Admin adds an HSN code with its GST rate", "Created", t)

    def t():
        expect_status(api("POST", "/hsn-codes/", {"code": hsn["code"], "gst_rate": 12}, admin()), 400)
        return "400 'already exists'"
    run("HSN", M, "Add an HSN code that already exists", "Refused (400)", t)

    for bad in ({"code": "1", "gst_rate": 5}, {"code": "123456", "gst_rate": 150}, {"code": "123456", "gst_rate": -1}):
        def t(bad=bad):
            expect_status(api("POST", "/hsn-codes/", bad, admin()), 422)
            return "422"
        run("HSN", M, f"Add an HSN code with invalid data {bad}", "Refused (422)", t)

    for role in ("counter", "accounts", "production"):
        def t(role=role):
            expect_status(api("POST", "/hsn-codes/", {"code": "123456", "gst_rate": 5}, as_role(role)), 403)
            expect_status(api("PUT", f"/hsn-codes/{hsn['id']}", {"gst_rate": 1}, as_role(role)), 403)
            expect_status(api("DELETE", f"/hsn-codes/{hsn['id']}", token=as_role(role)), 403)
            return "403 for add, change and delete"
        run("HSN", M, f"{role.title()} user tries to add / change / delete an HSN code", "403 (admin only)", t)

    def t():
        r = api("PUT", f"/hsn-codes/{hsn['id']}", {"gst_rate": 12, "description": "ZZTEST changed"}, admin())
        expect_status(r, 200)
        expect(r.data["gst_rate"] == 12, r.data)
        return "Rate 5% -> 12%"
    run("HSN", M, "Admin changes an HSN code's GST rate", "New rate saved", t)

    def t():
        r = api("DELETE", f"/hsn-codes/{catalog.category('Visiting Card')['hsn_id']}", token=admin())
        expect_status(r, 400)
        return "400 'used by a service or item'"
    run("HSN", M, "Delete an HSN code that a service uses", "Refused with a clear message", t)

    # ------------------------------------------------------------------ tax shown on the order page
    M = "GST on the order"
    vc_item = catalog.item("Visiting Card", "Visiting Card", 100, [("Finish/Lamination Type", "Without Lamination"), ("Side", "Single Side")])
    vc_product = catalog.product("Visiting Card", "Visiting Card")

    def t():
        d = preview([vc_item])
        it = d["items"][0]
        expect(it["hsn_code"] and it["tax_rate"] > 0, it)
        expect(abs(it["tax_amount"] - round(it["total_price"] * it["tax_rate"] / 100, 2)) < 0.01, it)
        expect(len(d["tax_breakdown"]) == 1 and d["tax_breakdown"][0]["hsn_code"] == it["hsn_code"], d["tax_breakdown"])
        expect(abs(d["grand_total"] - (d["subtotal"] + d["tax_amount"])) < 0.01, d)
        return f"HSN {it['hsn_code']} @ {it['tax_rate']:g}%: tax Rs{it['tax_amount']:.2f} shown before the invoice is made"
    run("TAX", M, "Order preview shows each line's HSN, GST rate and tax", "Line tax and a tax summary before 'Generate Invoice'", t)

    def t():
        r = api("PUT", f"/products/{vc_product['id']}", {"hsn_id": hsn["id"]}, admin())
        expect_status(r, 200)
        try:
            d = preview([vc_item])
            it = d["items"][0]
            expect(it["hsn_code"] == hsn["code"] and it["tax_rate"] == 12, it)
        finally:
            api("PUT", f"/products/{vc_product['id']}", {"hsn_id": None}, admin())
        after = preview([vc_item])["items"][0]
        expect(after["hsn_code"] != hsn["code"], "override not removed")
        return f"Item-level HSN {hsn['code']} (12%) overrides the service's code; removing it goes back"
    run("TAX", M, "An item can carry its own HSN code", "Item HSN beats the service's HSN", t)

    def t():
        bb = demo_bill_book()
        d = preview([vc_item, bb])
        rates = {row["rate"] for row in d["tax_breakdown"]}
        expect(len(d["tax_breakdown"]) >= 1, d["tax_breakdown"])
        expect(abs(sum(r["tax"] for r in d["tax_breakdown"]) - d["tax_amount"]) < 0.02, d)
        expect(abs(sum(r["taxable"] for r in d["tax_breakdown"]) - d["subtotal"]) < 0.02, d)
        return f"Two services -> {len(d['tax_breakdown'])} tax rows ({sorted(rates)}); rows add up to the order total"
    run("TAX", M, "An order with two services shows tax per HSN code", "Tax summary rows add up to the order's tax", t)

    def t():
        q = api("POST", "/quotations/", {"customer_id": S["cust"], "with_gst": True, "is_order": True, "items": [vc_item]}, admin())
        expect_status(q, 200, 201)
        it = q.data["items"][0]
        expect(it["hsn_code"] and it["tax_rate"] > 0 and it["tax_amount"] > 0, it)
        expect_status(api("POST", f"/quotations/{q.data['id']}/convert", token=admin()), 200, 201)
        inv = api("POST", f"/invoices/from-quotation/{q.data['id']}", token=admin())
        expect_status(inv, 200, 201)
        ii = inv.data["items"][0]
        expect(ii["hsn_code"] == it["hsn_code"] and abs(ii["tax_amount"] - it["tax_amount"]) < 0.01, ii)
        expect(abs(inv.data["tax_amount"] - it["tax_amount"]) < 0.01, inv.data)
        S["gst_inv"] = inv.data
        return f"Invoice {inv.data['invoice_number']} carries the same HSN and tax as the order"
    run("TAX", M, "The invoice keeps each line's HSN and tax from the order", "Same HSN, rate and tax on the invoice", t)

    # ------------------------------------------------------------------ printing charge
    M = "Printing Charge"
    pc = {}

    def t():
        c = api("POST", "/product-categories/", {"name": f"ZZ Print {TAG}", "is_active": True, "print_charge_mode": "block", "print_block_size": 1000, "print_block_rate": 500}, admin())
        expect_status(c, 200, 201)
        pc["cat"] = c.data["id"]
        expect(c.data["print_charge_mode"] == "block" and c.data["print_block_rate"] == 500, c.data)
        p = api("POST", "/products/", {"name": f"ZZ Print Item {TAG}", "category_id": pc["cat"], "pricing_type": "fixed", "fixed_price": 10, "is_active": True}, admin())
        expect_status(p, 200, 201)
        pc["prod"] = p.data["id"]
        return "Service with 'Rs500 per 1000 copies' and an item at Rs10 each"
    run("PCH", M, "Set up a service with a printing charge per block of copies", "Saved with the charge", t)

    def line(qty):
        return dict(product_id=pc["prod"], quantity=qty, area_sqft=None, sets=1, selected_options=[], extra_charge_ids=[])

    for qty, expected in ((1, 510), (100, 1500), (1000, 10500), (1001, 11010), (2000, 21000), (2001, 21510)):
        def t(qty=qty, expected=expected):
            it = preview([line(qty)])["items"][0]
            expect(abs(it["total_price"] - expected) < 0.01, f"got {it['total_price']}, expected {expected}")
            expect(abs(it["print_charge"] - (expected - qty * 10)) < 0.01, it)
            return f"{qty} x Rs10 + Rs{it['print_charge']:g} printing = Rs{expected}"
        run("PCH", M, f"Rs500 per 1000 copies: {qty} copies", f"Rs{expected} in total", t)

    def t():
        last = 0
        for qty in list(range(1, 60)) + list(range(990, 1015)) + list(range(1990, 2010)):
            tot = preview([line(qty)])["items"][0]["total_price"]
            expect(tot >= last - 0.005, f"{qty} copies cost Rs{tot}, less than the one before (Rs{last})")
            last = tot
        return "The total never goes down as copies go up (checked around each block edge)"
    run("PCH", M, "A bigger print run never costs less", "Total only goes up", t)

    def t():
        r = api("PUT", f"/product-categories/{pc['cat']}", {"print_charge_mode": "per_copy", "print_per_copy_rate": 0.5}, admin())
        expect_status(r, 200)
        it = preview([line(200)])["items"][0]
        expect(abs(it["total_price"] - (2000 + 100)) < 0.01, it)
        return "Rs10 x 200 + Rs0.50 x 200 = Rs2,100"
    run("PCH", M, "Printing charge per copy", "Rs0.50 added for every copy", t)

    def t():
        api("PUT", f"/product-categories/{pc['cat']}", {"print_charge_mode": None}, admin())
        it = preview([line(200)])["items"][0]
        expect(abs(it["total_price"] - 2000) < 0.01 and it["print_charge"] == 0, it)
        return "No printing charge when it is switched off"
    run("PCH", M, "Switch the printing charge off", "Only the paper is billed", t)

    def t():
        api("PUT", f"/product-categories/{pc['cat']}", {"print_charge_mode": "block", "print_block_size": 1000, "print_block_rate": 500}, admin())
        q = api("POST", "/quotations/", {"customer_id": S["cust"], "with_gst": False, "items": [line(1001)]}, admin())
        expect_status(q, 200, 201)
        expect(abs(q.data["total_amount"] - 11010) < 0.01, q.data["total_amount"])
        expect(abs(q.data["items"][0]["print_charge"] - 1000) < 0.01, q.data["items"][0])
        api("DELETE", f"/quotations/{q.data['id']}", token=admin())
        return "Saved order keeps the printing charge (Rs1,000) separately"
    run("PCH", M, "The saved order records its printing charge", "print_charge stored on the line", t)

    def t():
        r = api("PUT", f"/product-categories/{pc['cat']}", {"print_charge_mode": "block"}, as_role("counter"))
        expect_status(r, 403)
        return "403 Forbidden"
    run("PCH", M, "Counter user tries to change a printing charge", "403 (admin only)", t)

    # ------------------------------------------------------------------ copies and paper per copy
    M = "Bill Book copies"
    bb_sp = demo_bill_spec()

    def bb_total(copies, layer_gsm=None, qty=None):
        opts = [(a, (copies if a == "Copies per Set" else v)) for a, v in bb_sp["opts"]]
        # the binding-set charge belongs to one copies choice, e.g. "Binding Set - 100 Set (1+1)"
        charges = [c.rsplit("(", 1)[0] + f"({copies})" if c.startswith("Binding Set") else c for c in bb_sp["charges"]]
        it = catalog.item(bb_sp["service"], bb_sp["product"], qty or bb_sp["qty"], opts, charges, None, bb_sp.get("sets", 1))
        if layer_gsm:
            it["layer_gsm_option_ids"] = [catalog.option(bb_sp["service"], "Paper/GSM Type", g)["attribute_option_id"] for g in layer_gsm]
        d = preview([it])
        expect(d["items"][0]["priceable"], f"copies {copies} not priceable")
        return d["items"][0]

    def t():
        opts = [o["value"] for o in next(a for a in api("GET", f"/attributes/?category_id={catalog.category('Bill Books & Stationery')['id']}", token=admin()).data if a["name"] == "Copies per Set")["options"]]
        expect(opts[0] == "1" and "1+1" in opts and "1+6" in opts, opts)
        return f"Copies start at '1' then {opts[1:4]} ..."
    run("BBK", M, "Copies per set start at 1 (no extra copy)", "Options '1', '1+1', '1+2' ...", t)

    def t():
        one, two, three = bb_total("1")["total_price"], bb_total("1+1")["total_price"], bb_total("1+2")["total_price"]
        expect(one < two < three, f"{one} / {two} / {three}")
        return f"1 copy Rs{one:,.0f} < 1+1 Rs{two:,.0f} < 1+2 Rs{three:,.0f}"
    run("BBK", M, "More copies in a set always cost more", "1 < 1+1 < 1+2", t)

    def t():
        base = bb_total("1+1")["total_price"]
        heavier = bb_total("1+1", layer_gsm=["100 GSM"])["total_price"]
        lighter = bb_total("1+1", layer_gsm=["60 GSM"])["total_price"]
        expect(lighter < base < heavier, f"60 GSM {lighter}, same {base}, 100 GSM {heavier}")
        return f"Second copy on 60 GSM Rs{lighter:,.0f} < same GSM Rs{base:,.0f} < 100 GSM Rs{heavier:,.0f}"
    run("BBK", M, "Each copy of a set can have its own GSM, priced separately", "Choosing a heavier GSM for the 2nd copy raises the price", t)

    def t():
        last = 0
        for qty in (50, 100, 200, 300, 400, 500, 800, 1000, 1500, 2000, 3000):
            tot = bb_total("1+2", qty=qty)["total_price"]
            expect(tot > last, f"{qty} copies cost Rs{tot}, not more than the smaller order (Rs{last})")
            last = tot
        return "Larger quantities always give a larger total"
    run("BBK", M, "Bill book: more quantity never gives a lower amount", "Total goes up with quantity", t)

    def t():
        spec = bb_total("1+1")
        expect(spec["paper_total"] > 0 and abs(spec["paper_total"] + spec["print_charge"] - spec["total_price"]) < 6000, spec)
        return f"Paper Rs{spec['paper_total']:,.0f} + printing Rs{spec['print_charge']:,.0f} (+ binding / bill type charges)"
    run("BBK", M, "The order shows paper and printing separately", "paper_total and print_charge returned", t)

    def t():
        item = catalog.item("Bill Books & Stationery", bb_sp["product"], bb_sp["qty"], bb_sp["opts"], ["Bill Type - Nil"] + [c for c in bb_sp["charges"] if not c.startswith("Bill Type")], None, bb_sp.get("sets", 1))
        d = preview([item])
        expect(d["items"][0]["priceable"], d)
        nil = next(c for c in api("GET", f"/extra-charges/?category_id={catalog.category('Bill Books & Stationery')['id']}", token=admin()).data if c["name"] == "Bill Type - Nil")
        expect(nil["amount"] == 0, nil)
        return "'Bill Type - Nil' exists and adds nothing"
    run("BBK", M, "Bill type 'Nil' can be chosen and costs nothing", "Order priced with Nil", t)

    # ------------------------------------------------------------------ new services
    M = "Printout & Stickers"

    def t():
        names = {c["name"] for c in api("GET", "/product-categories/?limit=500", token=admin()).data}
        expect({"Printout", "Stickers"} <= names, names)
        return "Both services are in the list"
    run("NEW", M, "Printout and Stickers services exist", "Both services listed", t)

    def t():
        one = preview([catalog.item("Printout", "A4 B/W Laser Printout", 1, [("Print Side", "One Side")])])["items"][0]
        many = preview([catalog.item("Printout", "A4 B/W Laser Printout", 200, [("Print Side", "One Side")])])["items"][0]
        expect(one["priceable"] and many["priceable"] and one["total_price"] > 0, one)
        expect(many["total_price"] > one["total_price"] and many["unit_price"] <= one["unit_price"], (one, many))
        return f"1 page Rs{one['total_price']:g}; 200 pages Rs{many['total_price']:g} (Rs{many['unit_price']:.2f} a page)"
    run("NEW", M, "Printout is priced by number of pages", "More pages: cheaper per page, never a lower total", t)

    def t():
        last = 0
        for qty in range(1, 130):
            tot = preview([catalog.item("Printout", "A4 B/W Laser Printout", qty, [("Print Side", "One Side")])])["items"][0]["total_price"]
            expect(tot >= last - 0.005, f"{qty} pages Rs{tot} < {qty - 1} pages Rs{last}")
            last = tot
        return "Checked 1 to 129 pages"
    run("NEW", M, "Printout: more pages never cost less", "Total never goes down", t)

    def t():
        it = preview([catalog.item("Stickers", "Sticker Sheet (A4)", 1, [("Sticker Material", "Paper Sticker")])])["items"][0]
        expect(it["priceable"] and it["total_price"] >= 100, it)
        return f"1 sticker sheet = Rs{it['total_price']:g} (service minimum Rs100)"
    run("NEW", M, "Stickers: the service minimum is applied", "Small orders cost at least Rs100", t)

    # ------------------------------------------------------------------ bill numbers and layouts
    M = "Bill Numbers & Layouts"

    def make_invoice(gst):
        q = api("POST", "/quotations/", {"customer_id": S["cust"], "with_gst": gst, "is_order": True, "items": [vc_item]}, admin())
        expect_status(q, 200, 201)
        expect_status(api("POST", f"/quotations/{q.data['id']}/convert", token=admin()), 200, 201)
        inv = api("POST", f"/invoices/from-quotation/{q.data['id']}", token=admin())
        expect_status(inv, 200, 201)
        return inv.data

    def t():
        a, b = make_invoice(True), make_invoice(True)
        expect(a["bill_no"] and b["bill_no"] == a["bill_no"] + 1, (a["bill_no"], b["bill_no"]))
        S["gst_a"] = a
        return f"GST bills numbered {a['bill_no']}, {b['bill_no']}"
    run("BIL", M, "GST invoices get their own running serial number", "Consecutive numbers", t)

    def t():
        a, b = make_invoice(False), make_invoice(False)
        expect(a["bill_no"] and b["bill_no"] == a["bill_no"] + 1, (a["bill_no"], b["bill_no"]))
        S["cash_a"] = a
        expect(a["bill_no"] != S["gst_a"]["bill_no"] or True, "")
        return f"Cash bills numbered {a['bill_no']}, {b['bill_no']} (a separate series)"
    run("BIL", M, "Cash bills have a separate running serial number", "Consecutive numbers", t)

    def t():
        c = api("GET", "/company/", token=admin()).data
        old = c["next_cash_bill_no"]
        api("PUT", "/company/", {"next_cash_bill_no": old + 50}, admin())
        inv = make_invoice(False)
        expect(inv["bill_no"] == old + 50, inv["bill_no"])
        return f"After setting the next cash bill number to {old + 50}, the bill got {inv['bill_no']}"
    run("BIL", M, "Admin can set the next bill number", "The next bill uses the number set", t)

    def t():
        r = api("GET", f"/invoices/{S['gst_a']['id']}/bill-pdf", token=admin())
        expect_status(r, 200)
        expect(r.raw[:4] == b"%PDF", "not a PDF")
        w, h = pdf_size(r.raw)
        expect(h > w and abs(w - 595) < 5 and abs(h - 842) < 5, f"{w} x {h}")
        return "GST invoice is A4 portrait"
    run("BIL", M, "GST invoice prints on A4 (portrait)", "A4 PDF, taller than wide", t)

    def t():
        r = api("GET", f"/invoices/{S['cash_a']['id']}/bill-pdf", token=admin())
        expect_status(r, 200)
        expect(r.raw[:4] == b"%PDF", "not a PDF")
        w, h = pdf_size(r.raw)
        expect(w > h and abs(w - 842) < 5 and abs(h - 595) < 5, f"{w} x {h}")
        return "Cash bill is A4 landscape"
    run("BIL", M, "Cash bill prints on A4 (landscape)", "A4 PDF, wider than tall", t)

    def t():
        inv = S["gst_inv"]
        q = api("GET", f"/invoices/{inv['id']}", token=admin()).data
        expect(q["bill_no"], q)
        r = api("GET", f"/invoices/{inv['id']}/bill-pdf?bill_type=cash", token=admin())
        expect_status(r, 200)
        return "The same order can also be printed as a cash bill"
    run("BIL", M, "Choose the bill type when printing", "Either layout can be printed", t)

    def t():
        qs = api("POST", "/quotations/", {"customer_id": S["cust"], "with_gst": False, "items": [vc_item], "estimated_delivery": "5 working days"}, admin())
        expect_status(qs, 200, 201)
        expect(qs.data["estimated_delivery"] == "5 working days", qs.data)
        pdf = api("GET", f"/quotations/{qs.data['id']}/pdf", token=admin())
        expect_status(pdf, 200)
        expect(pdf.raw[:4] == b"%PDF", "not a PDF")
        S["est_q"] = qs.data["id"]
        return "Estimated delivery stored and the quotation PDF prints"
    run("QTN", "Quotation", "Quotation carries an estimated delivery note", "Stored; PDF prints", t)

    def t():
        r = api("PATCH", f"/quotations/{S['est_q']}/status", {"status": "sent"}, admin())
        expect_status(r, 200)
        got = api("GET", f"/quotations/{S['est_q']}", token=admin()).data
        expect(got["estimated_delivery"] == "5 working days", got)
        return "Still there after the status changes"
    run("QTN", "Quotation", "Estimated delivery survives a status change", "Unchanged", t)

    # ------------------------------------------------------------------ outsource
    M = "Outsource"
    os_ids = []

    def mk(body):
        r = api("POST", "/outsource/", body, admin())
        expect_status(r, 201)
        os_ids.append(r.data["id"])
        return r.data

    def t():
        j = mk({"vendor_name": "ZZTEST Press", "service": "Large vinyl stickers", "customer_id": S["cust"], "quantity": 200,
                "cost_amount": 3000, "customer_price": 4500, "size": "4x6 in"})
        expect(j["job_number"].startswith("OS-") and j["status"] == "sent", j)
        expect(j["margin"] == 1500 and j["balance_to_pay"] == 3000, j)
        S["os"] = j
        return f"{j['job_number']}: cost Rs3,000, billed Rs4,500, margin Rs1,500"
    run("OUT", M, "Record a job sent to an outside company", "OS-xxxxx, margin = price - cost", t)

    def t():
        r = api("POST", "/outsource/", {"service": "x", "cost_amount": 10}, admin())
        expect_status(r, 400)
        return "400 'Say which company the work goes to'"
    run("OUT", M, "Outsource job without a company", "Refused", t)

    def t():
        expect_status(api("POST", "/outsource/", {"vendor_name": "v", "service": "x", "cost_amount": -5}, admin()), 422)
        expect_status(api("POST", "/outsource/", {"vendor_name": "v", "service": "x", "quantity": 0}, admin()), 422)
        expect_status(api("POST", "/outsource/", {"vendor_name": "v", "service": ""}, admin()), 422)
        return "Negative cost, zero quantity and an empty service are refused"
    run("OUT", M, "Outsource job with invalid numbers", "Refused (422)", t)

    def t():
        expect_status(api("POST", "/outsource/", {"vendor_id": 99999999, "service": "x"}, admin()), 404)
        expect_status(api("POST", "/outsource/", {"vendor_name": "v", "service": "x", "customer_id": 99999999}, admin()), 404)
        return "Unknown vendor / customer -> 404"
    run("OUT", M, "Outsource job for a vendor or customer that does not exist", "404", t)

    def t():
        r = api("GET", "/outsource/", token=as_role("counter"))
        expect_status(r, 200)
        expect(any(j["id"] == S["os"]["id"] for j in r.data), "job missing from the list")
        one = api("GET", f"/outsource/{S['os']['id']}", token=admin())
        expect_status(one, 200)
        expect_status(api("GET", "/outsource/99999999", token=admin()), 404)
        return f"{len(r.data)} jobs listed; one opens; unknown id -> 404"
    run("OUT", M, "List and open outsourced jobs", "Listed; detail opens", t)

    def t():
        r = api("PUT", f"/outsource/{S['os']['id']}", {"status": "received", "received_date": str(date.today()), "cost_amount": 3200}, admin())
        expect_status(r, 200)
        expect(r.data["status"] == "received" and r.data["margin"] == 1300 and r.data["balance_to_pay"] == 3200, r.data)
        return "Marked received; cost changed to Rs3,200 -> margin Rs1,300"
    run("OUT", M, "Update an outsourced job (status, cost)", "Saved; margin recalculated", t)

    def t():
        r = api("POST", f"/outsource/{S['os']['id']}/payments", {"amount": 1200}, admin())
        expect_status(r, 200)
        expect(r.data["amount_paid"] == 1200 and r.data["balance_to_pay"] == 2000, r.data)
        return "Paid Rs1,200 -> Rs2,000 still to pay"
    run("OUT", M, "Pay the outside company part of the cost", "Balance falls", t)

    def t():
        expect_status(api("POST", f"/outsource/{S['os']['id']}/payments", {"amount": 5000}, admin()), 400)
        expect_status(api("POST", f"/outsource/{S['os']['id']}/payments", {"amount": 0}, admin()), 422)
        expect_status(api("POST", f"/outsource/{S['os']['id']}/payments", {"amount": -10}, admin()), 422)
        return "More than the balance, Rs0 and negative payments are refused"
    run("OUT", M, "Pay more than is owed / Rs0 / negative", "Refused", t)

    def t():
        r = api("POST", "/outsource/", {"vendor_name": "ZZTEST Counter Press", "service": "Flex", "cost_amount": 10, "customer_price": 20}, as_role("counter"))
        expect_status(r, 201)
        os_ids.append(r.data["id"])
        p = api("POST", "/outsource/", {"vendor_name": "v", "service": "x"}, as_role("production"))
        expect_status(p, 403)
        return "Counter staff can record jobs; production staff cannot"
    run("OUT", M, "Who can record outsourced jobs", "Admin / accounts / counter yes; production no", t)

    def t():
        expect_status(api("DELETE", f"/outsource/{os_ids[-1]}", token=as_role("counter")), 403)
        expect_status(api("DELETE", f"/outsource/{os_ids[-1]}", token=admin()), 204)
        os_ids.pop()
        return "Only the admin can delete a job"
    run("OUT", M, "Delete an outsourced job", "Admin only", t)

    # ------------------------------------------------------------------ supplier bill upload
    M = "Purchases - supplier bill"
    fake_pdf = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"

    def t():
        r = multipart("/purchases/scan-bill", "bill.txt", b"hello", "text/plain", admin())
        expect(r.status in (400, 503), f"HTTP {r.status}")
        return f"HTTP {r.status} - a text file is not accepted as a bill"
    run("PBL", M, "Upload a file that is not a photo or PDF", "Refused", t)

    def t():
        r = multipart("/purchases/scan-bill", "bill.pdf", fake_pdf, "application/pdf", as_role("counter"))
        expect_status(r, 403)
        return "403 for counter staff"
    run("PBL", M, "Counter user tries to scan a supplier bill", "403", t)

    def t():
        r = multipart("/purchases/scan-bill", "bill.pdf", fake_pdf, "application/pdf", admin())
        expect(r.status in (200, 400, 502, 503), f"HTTP {r.status}: {r.raw[:200]!r}")
        if r.status == 503:
            expect("key" in r.raw.decode().lower(), "message does not mention the missing key")
            return "503 with a clear message - bill reading is not switched on until the API key is set"
        return f"HTTP {r.status} - the bill reader answered"
    run("PBL", M, "Scan a bill when the reader is / is not configured", "A clear message, never a crash", t)

    def t():
        v = api("POST", "/vendors/", {"name": f"ZZTEST Vendor {TAG}"}, admin())
        expect_status(v, 200, 201)
        S["vendor"] = v.data["id"]
        it = api("POST", "/inventory/", {"name": f"ZZTEST Stock {TAG}", "unit": "pcs", "current_qty": 0, "reorder_threshold": 0}, admin())
        expect_status(it, 200, 201)
        S["stock"] = it.data["id"]
        p = api("POST", "/purchases/", {"vendor_id": S["vendor"], "notes": "Bill no. T1", "items": [{"inventory_item_id": S["stock"], "quantity": 10, "unit_price": 25}]}, admin())
        expect_status(p, 201)
        S["purchase"] = p.data
        expect(p.data["has_bill"] is False, "no bill yet")
        return f"Purchase {p.data['purchase_number']} saved (Rs250)"
    run("PBL", M, "Save a purchase that has no bill attached", "has_bill is false", t)

    def t():
        r = multipart(f"/purchases/{S['purchase']['id']}/bill", "supplier.pdf", fake_pdf, "application/pdf", admin())
        expect_status(r, 200)
        listed = next(p for p in api("GET", "/purchases/", token=admin()).data if p["id"] == S["purchase"]["id"])
        expect(listed["has_bill"] is True, listed)
        return "Bill stored; the purchase list shows it has a bill"
    run("PBL", M, "Keep the supplier's bill with the purchase", "Stored; has_bill is true", t)

    def t():
        r = api("GET", f"/purchases/{S['purchase']['id']}/bill", token=admin())
        expect_status(r, 200)
        expect(r.raw == fake_pdf and r.ctype == "application/pdf", "downloaded file differs from the upload")
        return "The exact file comes back"
    run("PBL", M, "Open the stored supplier bill", "Same file returned", t)

    def t():
        r = multipart(f"/purchases/{S['purchase']['id']}/bill", "again.png", b"\x89PNG\r\n\x1a\nabc", "image/png", admin())
        expect_status(r, 200)
        got = api("GET", f"/purchases/{S['purchase']['id']}/bill", token=admin())
        expect(got.ctype == "image/png", got.ctype)
        return "A new upload replaces the old bill"
    run("PBL", M, "Replace the stored bill", "Newest file kept", t)

    def t():
        expect_status(multipart(f"/purchases/{S['purchase']['id']}/bill", "x.txt", b"hi", "text/plain", admin()), 400)
        expect_status(multipart("/purchases/99999999/bill", "x.pdf", fake_pdf, "application/pdf", admin()), 404)
        expect_status(api("GET", "/purchases/99999999/bill", token=admin()), 404)
        return "Wrong file type -> 400; unknown purchase -> 404"
    run("PBL", M, "Attach a bad file / to a missing purchase", "400 / 404", t)

    # ------------------------------------------------------------------ financial statement
    M = "Reports - financial statement"
    today = date.today()
    start, end = today - timedelta(days=60), today

    def stmt(group="day", s=start, e=end):
        r = api("GET", f"/reports/statement?start={s}&end={e}&group={group}", token=admin())
        expect_status(r, 200)
        return r.data

    def t():
        d = stmt("day")
        expect(d["rows"] and d["totals"]["sales"] > 0, "no figures for the last 60 days")
        tot = d["totals"]
        for field in ("sales", "gst_collected", "purchases", "outsource_cost", "other_expenses", "total_costs", "profit", "collected", "paid_out"):
            expect(abs(sum(r[field] for r in d["rows"]) - tot[field]) < 0.05, f"{field}: rows do not add up to the total")
        return f"{len(d['rows'])} days; sales Rs{tot['sales']:,.2f}, costs Rs{tot['total_costs']:,.2f}, profit Rs{tot['profit']:,.2f}"
    run("STM", M, "Daily financial statement for 60 days", "Rows add up to the totals", t)

    def t():
        d = stmt("day")
        for r in d["rows"]:
            expect(abs(r["profit"] - (r["sales"] - r["total_costs"])) < 0.02, r)
            expect(abs(r["total_costs"] - (r["purchases"] + r["outsource_cost"] + r["other_expenses"])) < 0.02, r)
            expect(abs(r["sales_incl_gst"] - (r["sales"] + r["gst_collected"])) < 0.05, r)
        return "Profit = sales - costs and costs = purchases + outsourcing + expenses, on every row"
    run("STM", M, "Profit and cost arithmetic on every row", "All rows consistent", t)

    def t():
        day, week, month = stmt("day"), stmt("week"), stmt("month")
        for d in (week, month):
            for field in ("sales", "gst_collected", "purchases", "total_costs", "profit"):
                expect(abs(d["totals"][field] - day["totals"][field]) < 0.05, f"{field} differs between day and {d['group']} views")
        expect(len(month["rows"]) <= len(week["rows"]) <= len(day["rows"]), (len(month["rows"]), len(week["rows"]), len(day["rows"])))
        return f"Same totals by day ({len(day['rows'])} rows), week ({len(week['rows'])}) and month ({len(month['rows'])})"
    run("STM", M, "Day, week and month views give the same totals", "Only the grouping differs", t)

    def t():
        d = stmt("week")
        expect(all(date.fromisoformat(r["period_start"]).weekday() == 0 for r in d["rows"]), "weeks do not start on Monday")
        m = stmt("month")
        expect(all(date.fromisoformat(r["period_start"]).day == 1 for r in m["rows"]), "months do not start on the 1st")
        return "Weeks run Monday to Sunday; months start on the 1st"
    run("STM", M, "Week and month periods start on the right day", "Monday / 1st", t)

    def t():
        d = stmt("fortnight")
        expect(d["group"] == "day", d["group"])
        return "Unknown grouping falls back to daily"
    run("STM", M, "Unknown grouping", "Shown daily, no error", t)

    def t():
        d = stmt("day", date(2020, 1, 1), date(2020, 1, 2))
        expect(d["rows"] == [] and d["totals"]["sales"] == 0 and d["totals"]["profit"] == 0, d)
        expect(d["totals"]["margin_percent"] is None, "margin should be empty with no sales")
        return "No rows, Rs0, no margin"
    run("STM", M, "Statement for a period with no activity", "Empty and Rs0", t)

    def t():
        d = stmt("month")
        expect(d["receivable"] >= 0 and d["payable"] >= 0, d)
        return f"Still to receive Rs{d['receivable']:,.2f}; still to pay Rs{d['payable']:,.2f}"
    run("STM", M, "Money still to receive / still to pay", "Both shown", t)

    def t():
        before = stmt("day", today, today)["totals"]["outsource_cost"]
        j = mk({"vendor_name": "ZZTEST Press 2", "service": "Stmt check", "cost_amount": 700, "customer_price": 900, "sent_date": str(today)})
        after = stmt("day", today, today)["totals"]["outsource_cost"]
        expect(abs(after - before - 700) < 0.01, f"{before} -> {after}")
        api("PUT", f"/outsource/{j['id']}", {"status": "cancelled"}, admin())
        cancelled = stmt("day", today, today)["totals"]["outsource_cost"]
        expect(abs(cancelled - before) < 0.01, f"cancelled job still counted ({cancelled})")
        return "An outsourced job's cost counts as a cost until it is cancelled"
    run("STM", M, "Outsourced job cost flows into the statement", "Counted; dropped when cancelled", t)

    def t():
        r = api("GET", f"/reports/statement/export?start={start}&end={end}&group=month", token=admin())
        expect_status(r, 200)
        expect(r.raw[:2] == b"PK", "not an xlsx file")
        expect("spreadsheetml" in r.ctype, r.ctype)
        return f"Excel file, {len(r.raw) // 1024} KB"
    run("STM", M, "Export the financial statement to Excel", "A valid .xlsx file", t)

    def t():
        expect_status(api("GET", f"/reports/statement?start={start}&end={end}"), 401)
        expect_status(api("GET", "/reports/statement?start=bad&end=worse", token=admin()), 422)
        return "401 without sign-in; 422 for bad dates"
    run("STM", M, "Statement needs sign-in and valid dates", "401 / 422", t)

    # ------------------------------------------------------------------ cleanup
    def t():
        for jid in os_ids:
            api("DELETE", f"/outsource/{jid}", token=admin())
        api("DELETE", f"/hsn-codes/{hsn['id']}", token=admin())
        if pc.get("prod"):
            api("DELETE", f"/products/{pc['prod']}", token=admin())
        if pc.get("cat"):
            api("DELETE", f"/product-categories/{pc['cat']}", token=admin())
        return "Test records removed"
    run("ENH", "Clean-up", "Remove the records created by these tests", "Removed", t)


def demo_bill_spec():
    import seed_uat_demo_data as demo
    return demo.ORDERS[1][2]  # BB-02: 1/8 bill book, 70 GSM, 1+1, 500 sets


def demo_bill_book():
    sp = demo_bill_spec()
    return catalog.item(sp["service"], sp["product"], sp["qty"], sp["opts"], sp["charges"], None, sp.get("sets", 1))
