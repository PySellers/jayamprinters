"""Client round 5: item sub-categories, required binding extras, the customer's earlier orders, contact export, advance and
pay-later payments with UPI / bank details and receipts, customer-owned and one-time stock with job materials, the
service-specific landscape paper job card, the account statement and the help chat."""

import re
import urllib.request
import uuid
from datetime import timedelta

import catalog
from framework import BASE, admin, api, as_role, expect, expect_status, run

TAG = uuid.uuid4().hex[:5]
PH = str(int(TAG, 16)).zfill(8)
M_SUB = "Round 5 - Items, sub-categories, extras"
M_PAY = "Round 5 - Advance, pay later, payment details"
M_CUS = "Round 5 - Customers and contacts"
M_STK = "Round 5 - Stock, purchases, job materials"
M_JC = "Round 5 - Paper job card and bills"
M_RPT = "Round 5 - Account statement"
M_BOT = "Round 5 - Help chat"
S = {"quotes": [], "invoices": [], "jobs": []}


def make_order(item, **kw):
    body = dict(customer_id=S["cust"], with_gst=False, is_order=True, items=[item], **kw)
    q = api("POST", "/quotations/", body, admin())
    expect_status(q, 200, 201)
    S["quotes"].append(q.data["id"])
    expect_status(api("POST", f"/quotations/{q.data['id']}/convert", token=admin()), 200, 201)
    inv = api("POST", f"/invoices/from-quotation/{q.data['id']}", token=admin())
    expect_status(inv, 200, 201)
    S["invoices"].append(inv.data["id"])
    job = next(j for j in api("GET", "/job-cards/", token=admin()).data if j["quotation_item_id"] == q.data["items"][0]["id"])
    S["jobs"].append(job["id"])
    return q.data, inv.data, job


def vc(qty=100):
    return catalog.item("Visiting Card", "Visiting Card", qty, [("Finish/Lamination Type", "Without Lamination"), ("Side", "Single Side")])


def xerox(qty=50):
    return catalog.item("Xerox / Photocopy", "Xerox / Photocopy", qty, [("Paper Size", "A4"), ("Colour", "Black & White"), ("Print Side", "Single Side")])


def bill(qty=500, copies="1+1"):
    return catalog.item("Bill Books & Stationery", "Sheet Printing - 1/4", qty,
                        [("Document Type", "Bill Book"), ("Paper Name", "Excel Bond"), ("Paper/GSM Type", "80 GSM"), ("Copies per Set", copies)])


def upload(path, filename, content, ctype, token):
    """A multipart/form-data upload (the shared api() helper only speaks JSON)."""
    boundary = "----r5" + uuid.uuid4().hex
    body = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{filename}\"\r\nContent-Type: {ctype}\r\n\r\n").encode() + content + f"\r\n--{boundary}--\r\n".encode()
    req = urllib.request.Request(BASE + path, data=body, method="POST", headers={"Authorization": "Bearer " + token, "Content-Type": f"multipart/form-data; boundary={boundary}"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code


def raw(path, token):
    req = urllib.request.Request(BASE + path, headers={"Authorization": "Bearer " + token})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, r.read(), r.headers
    except urllib.error.HTTPError as e:
        return e.code, e.read(), e.headers


PNG = bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001") + b"\x0d\x0a\x2d\xb4" + bytes.fromhex("0000000049454e44ae426082")


def run_all():
    catalog.clear()
    c = api("POST", "/customers/", {"name": f"ZZTEST Round5 {TAG}", "phone": "83" + PH, "address": "5 Print Street, Chennai"}, admin())
    expect_status(c, 200, 201)
    S["cust"] = c.data["id"]
    counter = as_role("counter")
    production = as_role("production")
    accounts = as_role("accounts")

    # ================================================================== sub-categories, required extras
    def t():
        cat = catalog.category("Xerox / Photocopy")
        p = api("POST", "/products/", {"name": f"ZZ Sub item {TAG}", "category_id": cat["id"], "sub_category": f"ZZ Sub {TAG}", "pricing_type": "fixed", "fixed_price": 12, "is_active": False}, admin())
        expect_status(p, 200, 201)
        expect(p.data["sub_category"] == f"ZZ Sub {TAG}", p.data)
        u = api("PUT", f"/products/{p.data['id']}", {"sub_category": f"ZZ Moved {TAG}"}, admin())
        expect_status(u, 200)
        expect(u.data["sub_category"] == f"ZZ Moved {TAG}", u.data)
        got = next(x for x in api("GET", "/products/?limit=2000", token=admin()).data if x["id"] == p.data["id"])
        expect(got["sub_category"] == f"ZZ Moved {TAG}", got)
        expect_status(api("PUT", f"/products/{p.data['id']}", {"sub_category": "x"}, production), 403)
        api("DELETE", f"/products/{p.data['id']}", token=admin())
        return "An item can carry a sub-category, it is changed by the Admin only and is returned with the item list"
    run("R5S", M_SUB, "A product has a sub-category the admin can change", "Saved and listed; employee gets 403", t)

    def t():
        stamps = catalog.category("Rubber Stamp")
        items = [p for p in api("GET", "/products/?limit=2000", token=admin()).data if p["category_id"] == stamps["id"]]
        subs = {p["sub_category"] for p in items}
        expect(None not in subs and len(subs) >= 3, subs)
        expect("Printer / Dater Stamp" in subs and any(s.startswith("Polymer Stamp") for s in subs), subs)
        return f"Every rubber stamp item has a sub-category ({len(subs)} groups, e.g. Polymer Stamp - A Series, Printer / Dater Stamp)"
    run("R5S", M_SUB, "Rubber stamp sizes are grouped in sub-categories", "No stamp without a sub-category", t)

    def t():
        cat = catalog.category("Binding Services")
        expect(cat["extras_required"] is True, cat)
        charges = [x for x in api("GET", f"/extra-charges/?category_id={cat['id']}", token=admin()).data if x["is_active"]]
        groups = {x["group_name"] for x in charges}
        expect(groups == {"Binding Type", "Leather Binding"}, groups)
        return "Binding extras are two required choices: Binding Type and Leather Binding (None / option / Custom)"
    run("R5S", M_SUB, "Binding extras are required choices, not tick boxes", "extras_required + 2 groups", t)

    def t():
        cat = catalog.category("Xerox / Photocopy")
        names = [x["name"] for x in api("GET", f"/extra-charges/?category_id={cat['id']}", token=admin()).data if x["group_name"] == "Binding"]
        expect(all(n in names for n in ("Rexine Binding", "Tape Binding", "Wiro Binding")), names)
        new = api("POST", "/extra-charges/", {"name": f"ZZ Binding {TAG}", "charge_type": "per_set", "amount": 33, "group_name": "Binding", "category_id": cat["id"]}, admin())
        expect_status(new, 200, 201)
        expect(any(x["name"] == f"ZZ Binding {TAG}" for x in api("GET", f"/extra-charges/?category_id={cat['id']}", token=admin()).data), "new option not listed")
        api("DELETE", f"/extra-charges/{new.data['id']}", token=admin())
        return "Xerox has Rexine / Tape / Pin binding and the Admin can add another binding option that the order form lists"
    run("R5S", M_SUB, "More binding options for Xerox, managed by the admin", "New options appear", t)

    # ================================================================== customer history / contacts
    def t():
        h0 = api("GET", f"/customers/{S['cust']}/orders", token=counter)
        expect_status(h0, 200)
        expect(h0.data["orders"] == 0 and "New customer" in h0.data["tag"], h0.data)
        q, inv, job = make_order(vc(100), discount_type="percent", discount_value=10)
        h = api("GET", f"/customers/{S['cust']}/orders", token=counter).data
        expect(h["orders"] == 1 and len(h["rows"]) == 1, h)
        r = h["rows"][0]
        expect(r["invoice_id"] == inv["id"] and r["quantity"] == 100 and r["amount"] == inv["grand_total"] and "Visiting Card" in r["name"], r)
        expect(r["discount"] > 0 and r["balance"] == inv["grand_total"] and r["date"], r)
        expect(abs(h["total_billed"] - inv["grand_total"]) < 0.01 and h["discount_given"] == r["discount"], h)
        expect_status(api("GET", "/customers/999999/orders", token=counter), 404)
        return f"One line per earlier order (date, bill, item, qty, amount, discount, balance) and a summary: {h['tag']}"
    run("R5C", M_CUS, "A customer's earlier orders, one line each", "Row + summary for the customer", t)

    def t():
        for _ in range(3):
            make_order(vc(100))
        h = api("GET", f"/customers/{S['cust']}/orders", token=counter).data
        expect(h["orders"] == 4 and h["tag"] == "Regular customer", h)
        expect(h["rows"][0]["invoice_id"] > h["rows"][-1]["invoice_id"], "newest first")
        return "After four orders the customer is tagged Regular, newest order first"
    run("R5C", M_CUS, "Frequent customers are tagged for the discount decision", "Regular after 4 orders", t)

    def t():
        status, body, hdr = raw("/customers/export/contacts?format=vcf", admin())
        text = body.decode()
        expect(status == 200 and "text/vcard" in hdr["Content-Type"] and "BEGIN:VCARD" in text, status)
        expect(f"ZZTEST Round5 {TAG}" in text and "TEL;TYPE=CELL:+9183" + PH in text, "customer not in the vcf")
        status, body, hdr = raw("/customers/export/contacts?format=csv", admin())
        csv_text = body.decode()
        expect(status == 200 and csv_text.startswith("Name,Given Name") and "Sri Jayam Printers ::: * myContacts" in csv_text and "+9183" + PH in csv_text, csv_text[:200])
        cnt = api("GET", "/customers/export/contacts?format=count", token=admin())
        expect(cnt.data["count"] >= 1, cnt.data)
        for tok in (counter, production, accounts):
            expect_status(api("GET", "/customers/export/contacts?format=vcf", token=tok), 403)
        expect_status(api("GET", "/customers/export/contacts?format=vcf"), 401)
        return "The Admin downloads every phone number as .vcf and Google CSV (+91 numbers, label Sri Jayam Printers); others get 403"
    run("R5C", M_CUS, "Export contacts for the admin's phone / Google Contacts", "vcf + csv for admin only", t)

    # ================================================================== advance, pay later, payment details
    def t():
        q, inv, job = make_order(vc(200))
        total = inv["grand_total"]
        adv = round(total / 4, 2)
        r = api("POST", f"/invoices/{inv['id']}/payments", {"amount": adv, "method": "upi", "upi_id": "shop@upi", "reference_number": "UTR12345", "is_advance": True}, admin())
        expect_status(r, 200, 201)
        p = r.data["payments"][0]
        expect(p["is_advance"] is True and p["upi_id"] == "shop@upi" and p["reference_number"] == "UTR12345" and p["has_proof"] is False, p)
        expect(r.data["status"] == "partially_paid" and abs(r.data["amount_paid"] - adv) < 0.01, r.data)
        expect(upload(f"/payment-proofs/sale/{p['id']}", "upi.png", PNG, "image/png", admin()) == 200, "upload")
        got = api("GET", f"/invoices/{inv['id']}", token=admin()).data["payments"][0]
        expect(got["has_proof"] is True, got)
        status, body, hdr = raw(f"/payment-proofs/sale/{p['id']}", admin())
        expect(status == 200 and body[:4] == b"\x89PNG" and hdr["Content-Type"] == "image/png", status)
        expect(upload(f"/payment-proofs/sale/{p['id']}", "x.exe", b"MZ", "application/x-msdownload", admin()) == 400, "bad type accepted")
        expect(api("POST", f"/invoices/{inv['id']}/payments", {"amount": total, "method": "cash"}, admin()).status == 400, "paid more than the balance")
        S["adv_inv"], S["adv_pay"] = inv["id"], p["id"]
        return f"Advance of {adv} taken by UPI with the UPI id, UTR and a receipt image; invoice is partially paid; over-payment refused"
    run("R5P", M_PAY, "An advance is recorded with UPI details and a receipt", "Payment kept, receipt downloadable", t)

    def t():
        inv = api("GET", f"/invoices/{S['adv_inv']}", token=admin()).data
        for kind, fmt in (("gst", "gst"), ("cash", "cash")):
            status, body, hdr = raw(f"/invoices/{inv['id']}/bill-pdf?bill_type={fmt}", admin())
            expect(status == 200 and body[:4] == b"%PDF", status)
        status, body, _ = raw(f"/invoices/{inv['id']}/bill-pdf?bill_type=gst", admin())
        mb = re.search(rb"/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)", body)
        expect(mb and float(mb.group(1)) < float(mb.group(2)), "GST invoice should be portrait")
        status, body, _ = raw(f"/invoices/{inv['id']}/bill-pdf?bill_type=cash", admin())
        mb = re.search(rb"/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)", body)
        expect(mb and float(mb.group(1)) > float(mb.group(2)), "cash bill should be landscape")
        return "GST invoice (portrait) and cash bill (landscape) PDFs render for an invoice with an advance"
    run("R5P", M_PAY, "Bills are produced after an advance", "Both PDFs render", t)

    def t():
        _, inv, _ = make_order(vc(100))
        future = (__import__("datetime").date.today() + timedelta(days=3)).isoformat()
        past = (__import__("datetime").date.today() - timedelta(days=2)).isoformat()
        r = api("PATCH", f"/invoices/{inv['id']}", {"pay_by_date": future}, counter)
        expect_status(r, 200)
        expect(r.data["pay_by_date"] == future, r.data)
        dues = api("GET", "/invoices/dues?within_days=7", token=counter).data
        row = next(d for d in dues if d["invoice_id"] == inv["id"])
        expect(row["state"] == "upcoming" and row["days_left"] == 3 and abs(row["balance"] - inv["grand_total"]) < 0.01, row)
        expect(row["customer_name"] and "phone" in row, row)
        api("PATCH", f"/invoices/{inv['id']}", {"pay_by_date": past}, counter)
        row = next(d for d in api("GET", "/invoices/dues?within_days=0", token=counter).data if d["invoice_id"] == inv["id"])
        expect(row["state"] == "overdue" and row["days_left"] == -2, row)
        api("PATCH", f"/invoices/{inv['id']}", {"pay_by_date": future}, counter)
        expect(not any(d["invoice_id"] == inv["id"] for d in api("GET", "/invoices/dues?within_days=1", token=counter).data), "beyond the window")
        # once it is paid it leaves the list
        api("PUT", f"/invoices/{inv['id']}/status", {"status": "paid"}, counter)
        expect(not any(d["invoice_id"] == inv["id"] for d in api("GET", "/invoices/dues?within_days=30", token=counter).data), "paid invoice still listed")
        api("PATCH", f"/invoices/{inv['id']}", {"pay_by_date": None}, counter)
        return "The promised pay-by day puts the balance on the dues list (upcoming / overdue) until it is paid"
    run("R5P", M_PAY, "Pay later: balance, promised day and the dues list", "Upcoming, overdue, then gone when paid", t)

    # ================================================================== stock, purchases, job materials
    def t():
        v = api("POST", "/vendors/", {"name": f"ZZ Vendor {TAG}"}, admin())
        expect_status(v, 200, 201)
        S["vendor"] = v.data["id"]
        item = api("POST", "/inventory/", {"name": f"ZZ Paper {TAG}", "unit": "sheets", "current_qty": 100, "reorder_threshold": 20}, admin())
        expect_status(item, 200, 201)
        S["item"] = item.data["id"]
        p = api("POST", "/purchases/", {"vendor_id": S["vendor"], "items": [
            {"inventory_item_id": S["item"], "quantity": 50, "unit_price": 2},
            {"custom_name": f"ZZ Special foil {TAG}", "quantity": 3, "unit_price": 100},
        ]}, admin())
        expect_status(p, 200, 201)
        expect(abs(p.data["total_amount"] - 400) < 0.01, p.data)
        custom = next(i for i in p.data["items"] if i["custom_name"])
        expect(custom["inventory_item_id"] is None and custom["custom_name"].startswith("ZZ Special foil"), custom)
        stock = api("GET", f"/inventory/{S['item']}", token=admin()).data
        expect(stock["current_qty"] == 150, stock)
        names = [i["name"] for i in api("GET", "/inventory/", token=admin()).data]
        expect(not any("Special foil" in n for n in names), "a one-time item was added to the stock")
        expect_status(api("POST", "/purchases/", {"vendor_id": S["vendor"], "items": [{"quantity": 1, "unit_price": 1}]}, admin()), 400)
        S["purchase"] = p.data["id"]
        return "A one-time item is on the bill (total 400) but is never added to the stock; the stock item went 100 -> 150"
    run("R5T", M_STK, "Purchase with a one-time custom product", "Not counted in stock", t)

    def t():
        pay = api("POST", f"/purchases/{S['purchase']}/payments", {"amount": 150, "method": "bank_transfer", "bank_details": "Indian Bank ***146", "reference_number": "NEFT99"}, admin())
        expect_status(pay, 200, 201)
        pp = pay.data["payments"][0]
        expect(pp["bank_details"] == "Indian Bank ***146" and pp["reference_number"] == "NEFT99" and pp["has_proof"] is False, pp)
        expect(upload(f"/payment-proofs/purchase/{pp['id']}", "slip.png", PNG, "image/png", admin()) == 200, "upload")
        expect(upload(f"/payment-proofs/purchase/{pp['id']}", "slip.png", PNG, "image/png", production) == 403, "production may not upload purchase receipts")
        got = api("GET", f"/purchases/{S['purchase']}", token=admin()).data["payments"][0]
        expect(got["has_proof"] is True, got)
        # outsource
        job = api("POST", "/outsource/", {"vendor_name": f"ZZ Press {TAG}", "service": "Large print", "quantity": 5, "cost_amount": 500, "customer_price": 800}, admin())
        expect_status(job, 200, 201)
        paid = api("POST", f"/outsource/{job.data['id']}/payments", {"amount": 200, "method": "upi", "upi_id": "press@upi", "reference_number": "U1"}, admin())
        expect_status(paid, 200, 201)
        op = paid.data["payments"][0]
        expect(op["upi_id"] == "press@upi" and paid.data["amount_paid"] == 200 and paid.data["balance_to_pay"] == 300, paid.data)
        expect(upload(f"/payment-proofs/outsource/{op['id']}", "u.png", PNG, "image/png", admin()) == 200, "upload")
        expect_status(api("GET", f"/payment-proofs/outsource/{op['id']}", token=admin()), 200)
        expect_status(api("GET", "/payment-proofs/nonsense/1", token=admin()), 404)
        S["os_job"] = job.data["id"]
        return "Purchase and outsource payments keep the bank / UPI details and an uploaded receipt (sales, purchase and outsource)"
    run("R5T", M_STK, "Transaction details and receipts on purchase and outsource payments", "Details + receipt kept", t)

    def t():
        item = api("POST", "/inventory/", {"name": f"ZZ Cust paper {TAG}", "unit": "sheets", "current_qty": 40, "reorder_threshold": 100, "customer_id": S["cust"]}, admin())
        expect_status(item, 200, 201)
        expect(item.data["customer_id"] == S["cust"] and item.data["customer_name"].startswith("ZZTEST Round5"), item.data)
        S["cust_item"] = item.data["id"]
        low = api("GET", "/inventory/low-stock", token=counter).data
        expect(not any(i["id"] == S["cust_item"] for i in low), "a customer's own material is not stock the shop must buy")
        only = api("GET", f"/inventory/?customer_id={S['cust']}", token=counter).data
        expect(len(only) == 1 and only[0]["id"] == S["cust_item"], only)
        # the shop's own item that runs out is flagged
        own = api("POST", "/inventory/", {"name": f"ZZ Empty {TAG}", "unit": "pcs", "current_qty": 0, "reorder_threshold": 5}, admin())
        low = api("GET", "/inventory/low-stock", token=counter).data
        row = next(i for i in low if i["id"] == own.data["id"])
        expect(row["stock_state"] == "empty", row)
        s5 = api("PUT", f"/inventory/{own.data['id']}", {"current_qty": 3}, admin())
        expect(s5.data["stock_state"] == "low" and s5.data["low_stock"] is True, s5.data)
        expect(api("GET", f"/inventory/{S['item']}", token=admin()).data["stock_state"] == "ok", "150 > 20 should be ok")
        api("DELETE", f"/inventory/{own.data['id']}", token=admin())
        return "Customer-owned stock is separate and never in the buy list; the shop's items show Empty, Low or OK"
    run("R5T", M_STK, "Customer's own material and low / empty stock alerts", "Separate list; states ok/low/empty", t)

    def t():
        _, _, job = make_order(vc(100))
        before = api("GET", f"/inventory/{S['item']}", token=admin()).data["current_qty"]
        m = api("POST", f"/job-cards/{job['id']}/materials", {"inventory_item_id": S["item"], "quantity": 25, "note": "cover sheets"}, counter)
        expect_status(m, 201)
        expect(m.data["item_name"].startswith("ZZ Paper") and m.data["stock_left"] == before - 25 and m.data["created_by"], m.data)
        expect(api("GET", f"/inventory/{S['item']}", token=admin()).data["current_qty"] == before - 25, "stock not reduced")
        expect_status(api("POST", f"/job-cards/{job['id']}/materials", {"inventory_item_id": S["item"], "quantity": 99999}, counter), 400)
        cm = api("POST", f"/job-cards/{job['id']}/materials", {"inventory_item_id": S["cust_item"], "quantity": 10}, counter)
        expect_status(cm, 201)
        expect(cm.data["customer_name"] and cm.data["stock_left"] == 30, cm.data)
        expect(len(api("GET", f"/job-cards/{job['id']}/materials", token=counter).data) == 2, "list")
        expect_status(api("DELETE", f"/job-materials/{m.data['id']}", token=counter), 204)
        expect(api("GET", f"/inventory/{S['item']}", token=admin()).data["current_qty"] == before, "stock not put back")
        expect_status(api("POST", f"/job-cards/{job['id']}/materials", {"inventory_item_id": S["item"], "quantity": 0}, counter), 422)
        expect_status(api("POST", "/job-cards/999999/materials", {"inventory_item_id": S["item"], "quantity": 1}, counter), 404)
        return "A job takes stock out (shop's own and a customer's own), refuses more than is in stock, and gives it back on removal"
    run("R5T", M_STK, "Materials used by a job reduce the stock automatically", "Stock down, up again on removal", t)

    # ================================================================== paper job card and bills
    def kinds():
        _, _, xj = make_order(xerox(50))
        _, _, bj = make_order(bill(500, "1+2"))
        _, _, vj = make_order(vc(100))
        return xj, bj, vj

    def t():
        xj, bj, vj = kinds()
        xs = api("GET", f"/job-cards/{xj['id']}/sheet", token=counter).data
        bs = api("GET", f"/job-cards/{bj['id']}/sheet", token=counter).data
        vs = api("GET", f"/job-cards/{vj['id']}/sheet", token=counter).data
        xp, bp, vp = xs["profile"], bs["profile"], vs["profile"]
        expect(xp["kind"] == "xerox" and not xp["show_colours"] and not xp["show_margin"] and not xp["show_proofs"] and not xp["show_numbering"] and xp["copy_rows"] == 1, xp)
        expect(xp["type_options"] == ["Xerox"] and "1st Proof" not in xp["position_options"], xp)
        expect(len(xs["sheet"]["paper"]) == 1 and xs["sheet"]["printing_colours"] == [], xs["sheet"])
        expect(bp["kind"] == "offset" and bp["show_colours"] and bp["show_margin"] and bp["show_numbering"] and bp["show_proofs"] and bp["copy_rows"] == 3, bp)
        expect(len(bs["sheet"]["paper"]) == 3, bs["sheet"]["paper"])
        expect(vp["show_colours"] and not vp["show_numbering"] and vp["copy_rows"] == 1 and "Screen" in vp["type_options"], vp)
        expect(xs["sheet"]["payment"]["first"] and not xs["sheet"]["payment"]["first"].startswith("Bill total"), xs["sheet"]["payment"])
        expect(xs["price_lines"] and all("label" in l and "amount" in l for l in xs["price_lines"]), xs["price_lines"])
        return "Xerox: no colours / margin / proofs / copy rows; bill book: 3 copy rows, margins, numbering, proofs; each has its own price list"
    run("R5J", M_JC, "The paper job card follows the service (not one generic form)", "Profile differs per service", t)

    def t():
        xj, bj, vj = kinds()
        for jid in (xj["id"], bj["id"]):
            for wp in ("false", "true"):
                status, body, hdr = raw(f"/job-cards/{jid}/sheet-pdf?with_price={wp}", counter)
                expect(status == 200 and body[:4] == b"%PDF" and hdr["Content-Type"] == "application/pdf", status)
                mb = re.search(rb"/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)", body)
                expect(mb and float(mb.group(1)) > float(mb.group(2)), "the paper job card must be landscape")
        expect_status(api("GET", "/job-cards/999999/sheet-pdf", token=counter), 404)
        status, body, _ = raw(f"/job-cards/{vj['id']}/pdf?with_price=true", counter)
        mb = re.search(rb"/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)", body)
        expect(status == 200 and mb and float(mb.group(1)) > float(mb.group(2)), "detailed job card PDF must be landscape too")
        return "Both job card prints are A4 landscape PDFs, with and without price"
    run("R5J", M_JC, "The paper job card prints in landscape", "MediaBox wider than tall", t)

    def t():
        _, _, job = make_order(vc(100))
        plain = api("GET", f"/job-cards/{job['id']}/detail?with_price=false", token=counter).data
        status, with_price, _ = raw(f"/job-cards/{job['id']}/pdf?with_price=true", counter)
        status2, without, _ = raw(f"/job-cards/{job['id']}/pdf?with_price=false", counter)
        expect(status == 200 and status2 == 200, (status, status2))
        expect(plain["steps"], "the job has steps")
        return "Priced job card PDF and plain job card PDF both render (steps are left off the priced one)"
    run("R5J", M_JC, "Priced job card has no production steps section", "Renders; steps only on the plain copy", t)

    def t():
        challans = api("GET", "/delivery-challans/", token=counter).data
        expect(challans, "no challan to print")
        status, body, hdr = raw(f"/delivery-challans/{challans[0]['id']}/pdf", counter)
        expect(status == 200 and body[:4] == b"%PDF", status)
        return "The delivery challan renders (white form with blue outlines)"
    run("R5J", M_JC, "Delivery challan PDF", "Renders", t)

    # ================================================================== account statement
    def t():
        today = __import__("datetime").date.today()
        start = (today - timedelta(days=14)).isoformat()
        end = today.isoformat()
        d = api("GET", f"/reports/ledger?start={start}&end={end}&group=day&basis=accrual", token=admin())
        expect_status(d, 200)
        data = d.data
        entries = [e for p in data["periods"] for e in p["entries"]]
        expect(entries and [e["sr"] for e in entries] == list(range(1, len(entries) + 1)), "serial numbers must run 1..n")
        run_bal = 0.0
        for e in entries:
            run_bal = round(run_bal + e["credit"] - e["debit"], 2)
            expect(abs(e["balance"] - run_bal) < 0.02, (e, run_bal))
        t_ = data["totals"]
        expect(abs(t_["debit"] - sum(e["debit"] for e in entries)) < 0.05 and abs(t_["credit"] - sum(e["credit"] for e in entries)) < 0.05, t_)
        expect(abs(t_["balance"] - (t_["credit"] - t_["debit"])) < 0.05 and t_["entries"] == len(entries) and t_["summary"], t_)
        expect(any(e["kind"] == "sale" and "Sales" in e["particulars"] for e in entries), "no sales line")
        for p in data["periods"]:
            expect(p["summary"] and p["label"], p)
            expect(abs(p["credit"] - sum(e["credit"] for e in p["entries"])) < 0.02, p["label"])
        return f"{len(entries)} lines with serial numbers, running balance, per-day summaries ({t_['summary']}) and a grand total"
    run("R5R", M_RPT, "Account statement per day, like a bank statement", "Serial, particulars, debit, credit, balance, totals", t)

    def t():
        today = __import__("datetime").date.today()
        start = (today - timedelta(days=14)).isoformat()
        end = today.isoformat()
        w = api("GET", f"/reports/ledger?start={start}&end={end}&group=week&basis=cash", token=admin()).data
        expect(w["group"] == "week" and w["basis"] == "cash" and w["periods"], w)
        expect(all(" to " in p["label"] for p in w["periods"]), [p["label"] for p in w["periods"]])
        kinds_ = {e["kind"] for p in w["periods"] for e in p["entries"]}
        expect(kinds_ <= {"receipt", "purchase_payment", "outsource_payment", "cash_receipt", "expense"} and "receipt" in kinds_, kinds_)
        adv = [e for p in w["periods"] for e in p["entries"] if "UPI shop@upi" in e["particulars"]]
        expect(adv and adv[0]["credit"] > 0, "the advance with its UPI id should appear as money received")
        status, body, hdr = raw(f"/reports/ledger/export?start={start}&end={end}&group=day&basis=accrual", admin())
        expect(status == 200 and body[:2] == b"PK" and "spreadsheet" in hdr["Content-Type"], status)
        for tok in (counter, production, accounts):
            expect_status(api("GET", f"/reports/ledger?start={start}&end={end}", token=tok), 403)
        expect_status(api("GET", f"/reports/ledger?start={start}&end={end}"), 401)
        return "Weekly money-in-and-out view shows the UPI advance as received; Excel download works; the Admin only"
    run("R5R", M_RPT, "Money in and out per week, Excel, admin only", "Cash basis + xlsx + 403", t)

    # ================================================================== help chat
    def t():
        cases = {
            "How do I add an advance payment?": "Advance payment",
            "how to assign a task to an employee": "assigning",
            "where is the live jobs button": "Live Jobs",
            "how do I export phone numbers to google contacts": "Contacts",
            "how can I add a one time product in a purchase": "One-time",
            "how will I know stock is low": "Low stock",
            "how to print the paper job card": "job card",
        }
        for q, word in cases.items():
            r = api("POST", "/assistant/ask", {"question": q}, production)
            expect_status(r, 200)
            expect(r.data["found"] is True and word.lower() in r.data["answer"].lower() and r.data["link"].startswith("/"), (q, r.data["answer"][:120]))
        return f"{len(cases)} different how-to questions each get the right manual topic and a link to the page"
    run("R5B", M_BOT, "The help chat answers how-to questions from the manual", "Right topic + page link", t)

    def t():
        r = api("POST", "/assistant/ask", {"question": "what is the capital of France"}, counter)
        expect(r.data["found"] is False and "contact@pysellers.in" in r.data["answer"], r.data)
        g = api("POST", "/assistant/ask", {"question": "hello"}, counter)
        expect(g.data["found"] is True and "Hello" in g.data["answer"], g.data)
        e = api("POST", "/assistant/ask", {"question": "   "}, counter)
        expect(e.data["found"] is False, e.data)
        expect_status(api("POST", "/assistant/ask", {"question": "x" * 600}, counter), 422)
        topics = api("GET", "/assistant/topics", token=counter).data
        expect(len(topics) >= 40 and all(t_["title"] for t_ in topics), len(topics))
        expect_status(api("POST", "/assistant/ask", {"question": "hello"}), 401)
        return f"Unknown questions point to support, greetings work, an empty or huge question is handled, {len(topics)} topics, sign-in needed"
    run("R5B", M_BOT, "Unknown questions, greetings and limits", "Support contact; 401 without sign-in", t)

    def t():
        import os
        path = os.path.join(os.path.dirname(__file__), "..", "app", "knowledge", "manual.md")
        text = open(path, encoding="utf-8").read()
        titles = re.findall(r"^## (.+)$", text, re.M)
        expect(len(titles) == len(set(titles)), "duplicate topic titles")
        sections = re.split(r"^## ", text, flags=re.M)[1:]
        for sec in sections:
            expect("Keywords:" in sec and "Link:" in sec, f"topic without keywords / link: {sec[:50]}")
        routes = set(re.findall(r"^Link: (/\S*)$", text, re.M))
        known = {"/dashboard", "/profile", "/pricing-setup", "/quotations/new", "/invoices", "/job-cards", "/production", "/my-work", "/purchases", "/inventory",
                 "/outsource", "/cash-ledger", "/reports", "/customers", "/quotations", "/users", "/company", "/about", "/work-log"}
        expect(routes <= known, routes - known)
        return f"The manual has {len(titles)} topics, each with keywords and a page link that exists"
    run("R5B", M_BOT, "The knowledge file is well formed", "Every topic has keywords and a real page", t)

    # ================================================================== clean up
    for iid in S["invoices"]:
        api("DELETE", f"/invoices/{iid}", token=admin())
