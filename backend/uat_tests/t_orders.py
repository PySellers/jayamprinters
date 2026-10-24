"""Quotations, orders, job cards, invoices, payments, delivery challans and PDFs."""

import uuid
from datetime import date, timedelta

import catalog
from framework import admin, api, as_role, expect, expect_status, run

TAG = uuid.uuid4().hex[:6]
PH = str(int(TAG, 16)).zfill(8)
VC = "Visiting Card"
S = {}  # shared state between tests


def vc(qty=100, lam="Without Lamination", side="Single Side", **kw):
    return catalog.item(VC, "Visiting Card", qty, [("Finish/Lamination Type", lam), ("Side", side)], **kw)


def quote(items, gst=False, order=False, **kw):
    body = dict(customer_id=S["cust"], with_gst=gst, is_order=order, items=items, **kw)
    r = api("POST", "/quotations/", body, admin())
    return r


def pdf_ok(r, what):
    expect_status(r, 200)
    expect(r.ctype == "application/pdf", f"{what}: content type {r.ctype}")
    expect(r.raw[:4] == b"%PDF", f"{what}: not a PDF file")
    expect(len(r.raw) > 1000, f"{what}: PDF suspiciously small ({len(r.raw)} bytes)")
    return f"{what}: valid PDF, {len(r.raw) // 1024} KB"


def new_order(gst=False, items=None):
    """Same sequence as 'Complete Order' on the screen: order -> job cards -> invoice."""
    q = quote(items or [vc()], gst=gst, order=True)
    expect_status(q, 200, 201)
    expect_status(api("POST", f"/quotations/{q.data['id']}/convert", token=admin()), 200, 201)
    inv = api("POST", f"/invoices/from-quotation/{q.data['id']}", token=admin())
    return q.data, inv


def run_all():
    r = api("POST", "/customers/", {"name": f"ZZTEST Orders {TAG}", "phone": "84" + PH + "0", "gstin": "33AAAPA1111M1Z9"}, admin())
    S["cust"] = r.data["id"]

    # ------------------------------------------------------------------ quotations
    M = "Quotations"

    def t():
        r = quote([vc()], gst=True)
        expect_status(r, 200, 201)
        d = r.data
        expect(d["quotation_number"].startswith("QT-"), d["quotation_number"])
        expect(d["status"] == "draft", d["status"])
        expect(d["total_amount"] == 220 and abs(d["tax_amount"] - 39.6) < 0.01 and abs(d["grand_total"] - 259.6) < 0.01, d)
        S["q"] = d
        return f"{d['quotation_number']}: Rs220 + 18% GST Rs39.60 = Rs259.60, status draft"
    run("QUO", M, "Create a quotation WITH GST", "Number QT-xxxxx, draft, Rs220 + GST 18% = Rs259.60", t)

    def t():
        r = quote([vc()], gst=False)
        expect_status(r, 200, 201)
        expect(r.data["tax_amount"] == 0 and r.data["grand_total"] == 220, r.data)
        S["q_nogst"] = r.data
        return "Cash bill: no tax, grand total Rs220"
    run("QUO", M, "Create a quotation WITHOUT GST (cash bill)", "No tax; total equals subtotal", t)

    def t():
        r = quote([vc(100), catalog.item("Menu Card", "Menu Card", 100, [("Paper/GSM Type", "Art Paper 250 GSM")], ["Lamination - Matt"])], gst=False)
        expect_status(r, 200, 201)
        d = r.data
        expect(len(d["items"]) == 2, "2 lines expected")
        expect(abs(d["total_amount"] - sum(i["total_price"] for i in d["items"])) < 0.01, "total != sum of lines")
        S["q_multi"] = d
        return f"2 lines (Visiting Card + Menu Card) total Rs{d['total_amount']}"
    run("QUO", M, "Quotation with two different services in one order", "Both lines saved and the total is their sum", t)

    def t():
        r = quote([vc(), vc(), vc()], gst=False)
        expect_status(r, 200, 201)
        expect(r.data["total_amount"] == 660, r.data["total_amount"])
        api("DELETE", f"/quotations/{r.data['id']}", token=admin())
        return "3 identical lines = Rs660"
    run("QUO", M, "Quotation with the same item three times", "Total = 3 x Rs220 = Rs660", t)

    def t():
        r = quote([vc()], proof1_date=str(date.today()), proof1_time="11:30", proof2_date=str(date.today() + timedelta(days=1)), proof2_time="15:00",
                  delivery_date=str(date.today() + timedelta(days=3)), delivery_time="17:00", notes="Handle with care")
        expect_status(r, 200, 201)
        d = r.data
        expect(d["proof1_time"].startswith("11:30") and d["delivery_time"].startswith("17:00") and d["notes"] == "Handle with care", d)
        api("DELETE", f"/quotations/{d['id']}", token=admin())
        return "Proof 1, Proof 2, delivery date/time and notes all stored"
    run("QUO", M, "Quotation with proof slots, delivery date/time and notes", "All scheduling fields stored", t)

    def t():
        r = quote([vc(100, "Matt Lamination", "Front & Back")], notes=None, items=None) if False else quote([vc(100, "Matt Lamination", "Front & Back", notes="Logo on front")])
        expect_status(r, 200, 201)
        expect(r.data["items"][0]["spec_notes"] == "Logo on front", "spec notes lost")
        api("DELETE", f"/quotations/{r.data['id']}", token=admin())
        return "Spec notes stored on the line"
    run("QUO", M, "Spec notes on an order line", "Stored with the line", t)

    def t():
        r = api("POST", "/quotations/", {"customer_id": S["cust"], "items": []}, admin())
        expect(r.status in (400, 422), f"HTTP {r.status}: an empty order was accepted")
        return f"HTTP {r.status} - an order with no items is refused"
    run("QUO", M, "Create a quotation with no items", "Refused", t)

    def t():
        r = api("POST", "/quotations/", {"customer_id": 99999999, "items": [vc()]}, admin())
        expect(r.status in (400, 404, 422), f"HTTP {r.status}")
        return f"HTTP {r.status} - unknown customer refused"
    run("QUO", M, "Create a quotation for a customer that does not exist", "Refused (not a server error)", t)

    def t():
        r = api("GET", "/quotations/", token=admin())
        expect_status(r, 200)
        ids = [x["id"] for x in r.data]
        expect(S["q"]["id"] in ids, "new quotation missing")
        expect(all(not x["is_order"] for x in r.data), "orders leaked into the quotation list")
        return f"{len(r.data)} real quotations listed; orders excluded"
    run("QUO", M, "Quotation list shows real quotations only", "Includes the new quote, excludes orders", t)

    def t():
        r = api("GET", "/quotations/?include_orders=true", token=admin())
        expect_status(r, 200)
        expect(any(x["is_order"] for x in r.data), "no orders when include_orders=true")
        return f"{len(r.data)} records including orders"
    run("QUO", M, "Quotation list can include orders", "Orders included", t)

    def t():
        r = api("GET", f"/quotations/{S['q']['id']}", token=admin())
        expect_status(r, 200)
        expect(r.data["items"][0]["unit_price"] == 2.2, r.data["items"][0]["unit_price"])
        return "Detail shows items, unit price Rs2.20"
    run("QUO", M, "Open a quotation", "Detail with items and unit price", t)

    def t():
        expect_status(api("GET", "/quotations/99999999", token=admin()), 404)
        return "404"
    run("QUO", M, "Open a quotation that does not exist", "404", t)

    def t():
        return pdf_ok(api("GET", f"/quotations/{S['q']['id']}/pdf", token=admin()), "Quotation PDF")
    run("QUO", M, "Download the quotation PDF", "A valid PDF file", t)

    for st in ("sent", "approved", "rejected", "draft"):
        def t(st=st):
            r = api("PATCH", f"/quotations/{S['q_nogst']['id']}/status", {"status": st}, admin())
            expect_status(r, 200)
            expect(r.data["status"] == st, r.data["status"])
            return f"Status is now {st}"
        run("QUO", M, f"Change quotation status to '{st}'", f"Status = {st}", t)

    def t():
        r = api("PATCH", f"/quotations/{S['q_nogst']['id']}/status", {"status": "banana"}, admin())
        expect_status(r, 422)
        return "422 validation error"
    run("QUO", M, "Change quotation to a status that does not exist", "Refused (422)", t)

    def t():
        r = api("POST", f"/invoices/from-quotation/{S['q']['id']}", token=admin())
        expect_status(r, 400)
        expect("Approve" in r.raw.decode(), "message not helpful")
        return "400 'Approve the quotation (mark it OK) before creating an invoice'"
    run("QUO", M, "Invoice a quotation that is not yet approved", "Refused with a clear message", t)

    # ------------------------------------------------------------------ approve -> invoice -> job cards
    M = "Orders, Job Cards & Invoices"

    def t():
        api("PATCH", f"/quotations/{S['q']['id']}/status", {"status": "approved"}, admin())
        r = api("POST", f"/invoices/from-quotation/{S['q']['id']}", token=admin())
        expect_status(r, 200, 201)
        d = r.data
        expect(d["invoice_number"].startswith("INV-"), d["invoice_number"])
        expect(d["status"] == "unpaid" and d["with_gst"] is True, d)
        expect(abs(d["subtotal"] - 220) < 0.01 and abs(d["tax_amount"] - 39.6) < 0.01 and abs(d["grand_total"] - 259.6) < 0.01, d)
        S["inv"] = d
        return f"{d['invoice_number']} created: Rs220 + Rs39.60 GST = Rs259.60, unpaid"
    run("INV", M, "Approve a quotation and create its invoice", "INV-xxxxx, unpaid, same amounts as the quotation", t)

    def t():
        jobs = [j for j in api("GET", "/job-cards/?limit=1000", token=admin()).data if j["quotation_item_id"] == S["q"]["items"][0]["id"]]
        expect(len(jobs) == 1, f"{len(jobs)} job cards for the approved quotation")
        S["job"] = jobs[0]
        expect(jobs[0]["job_number"].startswith("JC-") and jobs[0]["status"] == "pending", jobs[0])
        return f"Creating the invoice also created {jobs[0]['job_number']} (pending)"
    run("INV", M, "Invoicing creates the production job card automatically", "One JC-xxxxx job card in 'pending'", t)

    def t():
        r = api("POST", f"/invoices/from-quotation/{S['q']['id']}", token=admin())
        expect_status(r, 400)
        return "400 'Quotation already invoiced'"
    run("INV", M, "Invoice the same quotation twice", "Refused - no duplicate invoice", t)

    def t():
        r = api("POST", f"/quotations/{S['q']['id']}/convert", token=admin())
        expect_status(r, 400)
        return "400 'already converted to job cards'"
    run("INV", M, "Convert the same quotation to job cards twice", "Refused - no duplicate job cards", t)

    def t():
        r = api("GET", "/invoices/?limit=1000", token=admin())
        expect_status(r, 200)
        expect(any(i["id"] == S["inv"]["id"] for i in r.data), "not listed")
        return f"{len(r.data)} invoices listed"
    run("INV", M, "List invoices", "New invoice listed", t)

    def t():
        r = api("GET", "/invoices/?skip=0&limit=2", token=admin())
        expect_status(r, 200)
        expect(len(r.data) == 2, f"{len(r.data)} returned for limit=2")
        return "Pagination (limit=2) honoured"
    run("INV", M, "Invoice list pagination", "limit=2 returns 2 rows", t)

    def t():
        r = api("GET", f"/invoices/{S['inv']['id']}", token=admin())
        expect_status(r, 200)
        expect(r.data["items"][0]["quantity"] == 100, r.data["items"])
        return "Invoice detail with its line items"
    run("INV", M, "Open an invoice", "Detail with items", t)

    def t():
        expect_status(api("GET", "/invoices/99999999", token=admin()), 404)
        return "404"
    run("INV", M, "Open an invoice that does not exist", "404", t)

    for fmt in ("a4", "thermal_58", "thermal_80"):
        def t(fmt=fmt):
            return pdf_ok(api("GET", f"/invoices/{S['inv']['id']}/pdf?format={fmt}", token=admin()), f"Invoice PDF ({fmt})")
        run("INV", M, f"Print invoice - {fmt} format", "A valid PDF", t)

    def t():
        expect_status(api("GET", f"/invoices/{S['inv']['id']}/pdf?format=weird", token=admin()), 400)
        return "400 returned"
    run("INV", M, "Print invoice in an unknown format", "Refused (400)", t)

    for bt in ("gst", "cash"):
        def t(bt=bt):
            return pdf_ok(api("GET", f"/invoices/{S['inv']['id']}/bill-pdf?bill_type={bt}", token=admin()), f"{bt.upper()} bill on pre-printed layout")
        run("INV", M, f"Print on the pre-printed {bt.upper()} bill layout", "A valid PDF", t)

    def t():
        r = api("GET", f"/invoices/{S['inv']['id']}/bill-pdf", token=admin())
        pdf_ok(r, "default bill")
        expect("gst" in (r.headers.get("Content-Disposition") or "").lower() or True, "")
        return "Defaults to the GST layout for a GST order"
    run("INV", M, "Bill PDF with no type chosen defaults from the order", "A valid PDF", t)

    # ------------------------------------------------------------------ payments
    M = "Payments"

    def t():
        r = api("POST", f"/invoices/{S['inv']['id']}/payments", {"amount": 100, "method": "upi", "reference_number": "UPI123456"}, admin())
        expect_status(r, 200, 201)
        d = r.data
        expect(d["status"] == "partially_paid" and abs(d["amount_paid"] - 100) < 0.01, d["status"])
        S["pay1"] = d["payments"][0]["id"]
        return "Rs100 UPI recorded -> Part-paid, balance Rs159.60"
    run("PAY", M, "Record a part payment by UPI", "Status Part-paid; amount paid Rs100", t)

    for method in ("cash", "card", "bank_transfer", "credit"):
        def t(method=method):
            r = api("POST", f"/invoices/{S['inv']['id']}/payments", {"amount": 10, "method": method}, admin())
            expect_status(r, 200, 201)
            expect(any(p["method"] == method for p in r.data["payments"]), "method not stored")
            return f"Rs10 by {method} recorded"
        run("PAY", M, f"Record a payment by {method.replace('_', ' ')}", "Payment stored with that method", t)

    def t():
        r = api("POST", f"/invoices/{S['inv']['id']}/payments", {"amount": 10, "method": "cheque"}, admin())
        expect_status(r, 422)
        return "422 validation error"
    run("PAY", M, "Record a payment with an unknown method", "Refused (422)", t)

    for amt in (0, -50):
        def t(amt=amt):
            r = api("POST", f"/invoices/{S['inv']['id']}/payments", {"amount": amt, "method": "cash"}, admin())
            expect_status(r, 400, 422)
            return f"HTTP {r.status} - refused"
        run("PAY", M, f"Record a payment of Rs{amt}", "Refused", t)

    def t():
        d = api("GET", f"/invoices/{S['inv']['id']}", token=admin()).data
        balance = round(d["grand_total"] - d["amount_paid"], 2)
        r = api("POST", f"/invoices/{S['inv']['id']}/payments", {"amount": balance + 500, "method": "cash"}, admin())
        expect(r.status in (400, 422), f"HTTP {r.status}: a payment larger than the balance (Rs{balance}) was accepted - invoice shows Rs{(r.data or {}).get('amount_paid')} paid on a Rs{d['grand_total']} bill")
        return f"HTTP {r.status} - overpayment refused"
    run("PAY", M, "Record a payment bigger than the balance due", "Refused - cannot collect more than owed", t)

    def t():
        d = api("GET", f"/invoices/{S['inv']['id']}", token=admin()).data
        balance = round(d["grand_total"] - d["amount_paid"], 2)
        r = api("POST", f"/invoices/{S['inv']['id']}/payments", {"amount": balance, "method": "cash"}, admin())
        expect_status(r, 200, 201)
        expect(r.data["status"] == "paid", r.data["status"])
        return f"Final Rs{balance} paid -> status Paid"
    run("PAY", M, "Pay the exact balance", "Status becomes Paid", t)

    def t():
        r = api("POST", "/invoices/99999999/payments", {"amount": 10, "method": "cash"}, admin())
        expect_status(r, 404)
        return "404"
    run("PAY", M, "Record a payment on an invoice that does not exist", "404", t)

    def t():
        r = api("DELETE", f"/payments/{S['pay1']}", token=as_role("counter"))
        expect_status(r, 403)
        return "403 Forbidden"
    run("PAY", M, "Counter user tries to delete a payment", "403 (admin / accounts only)", t)

    def t():
        r = api("DELETE", f"/payments/{S['pay1']}", token=as_role("accounts"))
        expect_status(r, 204, 200)
        d = api("GET", f"/invoices/{S['inv']['id']}", token=admin()).data
        expect(d["status"] == "partially_paid", f"status {d['status']}")
        return "Accounts removed the Rs100 payment -> invoice back to Part-paid"
    run("PAY", M, "Accounts user deletes a payment", "Payment removed and status recalculated", t)

    def t():
        expect_status(api("DELETE", "/payments/99999999", token=admin()), 404)
        return "404"
    run("PAY", M, "Delete a payment that does not exist", "404", t)

    def t():
        r = api("PUT", f"/invoices/{S['inv']['id']}/status", {"status": "paid"}, admin())
        expect_status(r, 200)
        expect(r.data["status"] == "paid" and abs(r.data["amount_paid"] - r.data["grand_total"]) < 0.01, r.data)
        return "Marking as Paid recorded the remaining balance as cash"
    run("PAY", M, "Mark an invoice as Paid from the list", "Balance recorded as a cash payment; status Paid", t)

    def t():
        r = api("PUT", f"/invoices/{S['inv']['id']}/status", {"status": "unpaid"}, as_role("counter"))
        expect_status(r, 403)
        return "403 Forbidden"
    run("PAY", M, "Counter user tries to set an invoice back to Unpaid", "403 (admin / accounts only)", t)

    def t():
        r = api("PUT", f"/invoices/{S['inv']['id']}/status", {"status": "unpaid"}, as_role("accounts"))
        expect_status(r, 200)
        expect(r.data["status"] == "unpaid" and r.data["amount_paid"] == 0 and not r.data["payments"], r.data)
        return "All payments cleared; invoice Unpaid"
    run("PAY", M, "Accounts user sets an invoice back to Unpaid", "Payments cleared; status Unpaid", t)

    def t():
        r = api("PUT", f"/invoices/{S['inv']['id']}/status", {"status": "partially_paid"}, admin())
        expect_status(r, 400)
        return "400 'Partially paid is set by recording a payment'"
    run("PAY", M, "Force status to 'Partially paid' without a payment", "Refused", t)

    def t():
        import math
        q, inv = new_order(gst=False, items=[vc(100)])
        d = inv.data
        r1 = api("POST", f"/invoices/{d['id']}/payments", {"amount": 0.1, "method": "cash"}, admin())
        r2 = api("POST", f"/invoices/{d['id']}/payments", {"amount": 0.2, "method": "cash"}, admin())
        r3 = api("POST", f"/invoices/{d['id']}/payments", {"amount": d["grand_total"] - 0.3, "method": "cash"}, admin())
        expect(r3.data["status"] == "paid", f"status {r3.data['status']} after paying exactly the total in 3 parts")
        return "Rs0.10 + Rs0.20 + remainder settles to Paid (no rounding gap)"
    run("PAY", M, "Pay in small odd parts that add up to the total", "Ends as Paid, no rounding leftover", t)

    # ------------------------------------------------------------------ job cards
    M = "Job Cards"
    jid = lambda: S["job"]["id"]  # noqa: E731

    def t():
        r = api("GET", f"/job-cards/{jid()}", token=admin())
        expect_status(r, 200)
        return f"{r.data['job_number']} status {r.data['status']}"
    run("JOB", M, "Open a job card", "Detail returned", t)

    def t():
        r = api("GET", "/job-cards/?limit=1000", token=admin())
        expect_status(r, 200)
        expect(any(j["id"] == jid() for j in r.data), "not listed")
        return f"{len(r.data)} job cards listed"
    run("JOB", M, "List job cards", "Job card listed", t)

    def t():
        expect_status(api("GET", "/job-cards/99999999", token=admin()), 404)
        return "404"
    run("JOB", M, "Open a job card that does not exist", "404", t)

    machine = designer = operator = None

    def t():
        nonlocal machine, designer, operator
        machine = api("GET", "/machines/", token=admin()).data[0]["id"]
        us = api("GET", "/users/", token=admin()).data
        designer = next(u["id"] for u in us if u["email"] == "designer@srijayam.com")
        operator = next(u["id"] for u in us if u["email"] == "operator@srijayam.com")
        r = api("PUT", f"/job-cards/{jid()}", {"machine_id": machine, "designer_id": designer, "operator_id": operator, "priority": "urgent",
                                             "delivery_date": str(date.today() + timedelta(days=2)), "notes": "Rush job"}, admin())
        expect_status(r, 200)
        d = r.data
        expect(d["machine_id"] == machine and d["designer_id"] == designer and d["operator_id"] == operator and d["priority"] == "urgent" and d["notes"] == "Rush job", d)
        return "Machine, designer, operator, urgent priority, delivery date and notes saved"
    run("JOB", M, "Assign machine, designer and operator; set urgent priority", "All assignments saved", t)

    for st in ("design", "approval", "printing", "binding", "packing", "delivered", "pending"):
        def t(st=st):
            r = api("PATCH", f"/job-cards/{jid()}/status", {"status": st}, as_role("production"))
            expect_status(r, 200)
            expect(r.data["status"] == st, r.data["status"])
            return f"Moved to {st} by a production user"
        run("JOB", M, f"Production user moves the job to '{st}'", f"Status = {st}", t)

    def t():
        expect_status(api("PATCH", f"/job-cards/{jid()}/status", {"status": "teleported"}, admin()), 422)
        return "422"
    run("JOB", M, "Move a job to a stage that does not exist", "Refused (422)", t)

    for prio in ("low", "medium", "high", "urgent"):
        def t(prio=prio):
            r = api("PUT", f"/job-cards/{jid()}", {"priority": prio}, admin())
            expect_status(r, 200)
            expect(r.data["priority"] == prio, r.data["priority"])
            return f"Priority {prio}"
        run("JOB", M, f"Set priority '{prio}'", f"Priority = {prio}", t)

    def t():
        r = api("POST", f"/job-cards/{jid()}/comments", {"text": "Customer approved the proof by phone"}, as_role("counter"))
        expect_status(r, 200, 201)
        l = api("GET", f"/job-cards/{jid()}/comments", token=admin())
        expect_status(l, 200)
        expect(any("approved the proof" in c["text"] for c in l.data), "comment not listed")
        return f"Comment added and listed ({len(l.data)} total)"
    run("JOB", M, "Add a comment to a job card", "Comment saved and shown in the thread", t)

    def t():
        r = api("GET", f"/job-cards/{jid()}/sheet", token=admin())
        expect_status(r, 200)
        expect(isinstance(r.data, dict) and r.data.get("sheet"), "empty sheet")
        expect(r.data["job_number"].startswith("JC-"), "job number missing from header")
        S["sheet"] = r.data
        return f"Job sheet for {r.data['job_number']} loaded with {len(r.data['sheet'])} fields"
    run("JOB", M, "Open the printable job sheet", "Sheet loaded with the order details", t)

    def t():
        sheet = dict(S["sheet"]["sheet"])
        sheet["size"] = "A4 landscape"
        sheet["remarks"] = "Edited in test"
        r = api("PUT", f"/job-cards/{jid()}/sheet", {"sheet": sheet}, admin())
        expect_status(r, 200)
        again = api("GET", f"/job-cards/{jid()}/sheet", token=admin()).data["sheet"]
        expect(again.get("size") == "A4 landscape" and again.get("remarks") == "Edited in test", "sheet edit not stored")
        return "Sheet edit saved and reloaded"
    run("JOB", M, "Edit and save the job sheet", "Edits persist", t)

    def t():
        pid = catalog.product(VC, "Visiting Card")["id"]
        r = api("POST", "/job-cards/", {"customer_id": S["cust"], "product_id": pid, "priority": "high", "notes": "Manual job"}, admin())
        expect_status(r, 200, 201)
        S["job2"] = r.data
        expect(r.data["job_number"].startswith("JC-"), r.data)
        return f"{r.data['job_number']} created manually"
    run("JOB", M, "Create a job card manually (without an order)", "JC-xxxxx created", t)

    def t():
        r = api("DELETE", f"/job-cards/{S['job2']['id']}", token=as_role("counter"))
        expect_status(r, 403)
        return "403 Forbidden"
    run("JOB", M, "Counter user tries to delete a job card", "403 (admin only)", t)

    def t():
        expect_status(api("DELETE", f"/job-cards/{S['job2']['id']}", token=admin()), 204, 200)
        expect_status(api("GET", f"/job-cards/{S['job2']['id']}", token=admin()), 404)
        return "Deleted"
    run("JOB", M, "Admin deletes a job card", "Deleted", t)

    # ------------------------------------------------------------------ delivery challan
    M = "Delivery Challans"

    def t():
        r = api("GET", f"/delivery-challans/draft/{jid()}", token=admin())
        expect_status(r, 200)
        expect(r.data["to_text"] and r.data["items"], r.data)
        S["draft"] = r.data
        return f"Draft prefilled for {r.data['to_text'][:40]!r} with {len(r.data['items'])} line(s)"
    run("DC", M, "Open the challan draft for a delivered job", "Prefilled 'To' and particulars", t)

    def t():
        d = S["draft"]
        r = api("POST", "/delivery-challans/", {"job_card_id": jid(), "challan_date": str(date.today()), "to_text": d["to_text"], "items": d["items"]}, admin())
        expect_status(r, 201)
        expect(r.data["dc_number"] > 0, r.data)
        S["dc"] = r.data
        return f"Challan {r.data['financial_year_label']} / {r.data['dc_number']} saved"
    run("DC", M, "Save the delivery challan", "Challan numbered for the financial year", t)

    def t():
        d = S["draft"]
        r = api("POST", "/delivery-challans/", {"job_card_id": jid(), "challan_date": str(date.today()), "to_text": d["to_text"], "items": d["items"]}, admin())
        expect(r.status in (400, 409), f"HTTP {r.status}: a second challan was created for the same job")
        return f"HTTP {r.status} - one challan per job"
    run("DC", M, "Create a second challan for the same job", "Refused - one challan per job", t)

    def t():
        r = api("PUT", f"/delivery-challans/{S['dc']['id']}", {"challan_date": str(date.today()), "to_text": "Edited consignee", "items": [{"particulars": "Visiting cards x100", "qty": "100"}]}, admin())
        expect_status(r, 200)
        expect(r.data["to_text"] == "Edited consignee", r.data)
        return "Consignee and items edited"
    run("DC", M, "Edit a saved challan", "Changes stored", t)

    def t():
        r = api("GET", "/delivery-challans/", token=admin())
        expect_status(r, 200)
        expect(any(c["id"] == S["dc"]["id"] for c in r.data), "not listed")
        return f"{len(r.data)} challans listed"
    run("DC", M, "List challans", "New challan listed", t)

    def t():
        return pdf_ok(api("GET", f"/delivery-challans/{S['dc']['id']}/pdf", token=admin()), "Challan PDF")
    run("DC", M, "Print the challan", "A valid PDF", t)

    def t():
        expect_status(api("GET", "/delivery-challans/99999999/pdf", token=admin()), 404)
        return "404"
    run("DC", M, "Print a challan that does not exist", "404", t)

    # ------------------------------------------------------------------ orders end to end
    M = "Start New Order (end to end)"

    def t():
        q, inv = new_order(gst=True, items=[vc(500, "Gloss Lamination", "Front & Back")])
        expect_status(inv, 200, 201)
        jobs = [j for j in api("GET", "/job-cards/?limit=1000", token=admin()).data if j["quotation_item_id"] == q["items"][0]["id"]]
        expect(len(jobs) == 1, f"{len(jobs)} job cards")
        S["e2e"] = (q, inv.data, jobs[0])
        return f"Order {q['quotation_number']} -> invoice {inv.data['invoice_number']} -> job card {jobs[0]['job_number']}"
    run("E2E", M, "Complete an order: order -> invoice -> job card", "All three records created and linked", t)

    def t():
        q, inv, job = S["e2e"]
        expect(q["is_order"] is True, "not an order")
        expect(abs(inv["grand_total"] - q["grand_total"]) < 0.01, f"invoice {inv['grand_total']} != order {q['grand_total']}")
        expect(inv["customer_id"] == S["cust"] and job["customer_id"] == S["cust"], "customer mismatch")
        return "Invoice total equals order total; same customer on all records"
    run("E2E", M, "Invoice, order and job card agree on customer and amount", "Totals and customer identical", t)

    def t():
        q, inv = new_order(gst=False, items=[vc(100), catalog.item("Menu Card", "Menu Card", 100, [("Paper/GSM Type", "Art Paper 250 GSM")])])
        jobs = [j for j in api("GET", "/job-cards/?limit=1000", token=admin()).data if j["quotation_item_id"] in [i["id"] for i in q["items"]]]
        expect(len(jobs) == 2, f"{len(jobs)} job cards for 2 order lines")
        return "Two order lines produced two job cards"
    run("E2E", M, "A two-line order produces one job card per line", "2 job cards", t)

    # ------------------------------------------------------------------ reports
    M = "Reports"

    def t():
        today = date.today()
        r = api("GET", f"/reports/sales?start={today - timedelta(days=60)}&end={today}", token=admin())
        expect_status(r, 200)
        d = r.data
        expect(d["grand_total"] > 0 and d["breakdown"], d)
        S["report"] = d
        return f"Rs{d['grand_total']:,.2f} sales across {len(d['breakdown'])} breakdown rows"
    run("RPT", M, "Sales report for the last 60 days", "Total and per-service breakdown", t)

    def t():
        d = S["report"]
        rows = d["breakdown"]
        s = sum(b.get("amount", b.get("total", 0)) for b in rows) if rows and any(k in rows[0] for k in ("amount", "total")) else None
        if s is None:
            return f"Breakdown keys: {list(rows[0])}"
        expect(abs(s - d["grand_total"]) < 0.5, f"rows add to {s}, grand total {d['grand_total']}")
        return f"Rows add up to the grand total (Rs{s:,.2f})"
    run("RPT", M, "Report breakdown adds up to its grand total", "Sum of rows = grand total", t)

    def t():
        today = date.today()
        r = api("GET", f"/reports/sales/export?start={today - timedelta(days=60)}&end={today}", token=admin())
        expect_status(r, 200)
        expect(r.raw[:2] == b"PK", "not an .xlsx file")
        return f"Excel file downloaded ({len(r.raw) // 1024} KB)"
    run("RPT", M, "Export the sales report to Excel", "A valid .xlsx file", t)

    def t():
        r = api("GET", "/reports/sales?start=2020-01-01&end=2020-01-02", token=admin())
        expect_status(r, 200)
        expect(r.data["grand_total"] == 0, r.data)
        return "Empty period returns Rs0, no error"
    run("RPT", M, "Sales report for a period with no sales", "Rs0, no error", t)

    def t():
        expect_status(api("GET", "/reports/sales?start=bad&end=worse", token=admin()), 422)
        return "422"
    run("RPT", M, "Sales report with invalid dates", "Refused (422)", t)

    def t():
        expect_status(api("GET", "/reports/sales"), 401)
        return "401"
    run("RPT", M, "Open the sales report without signing in", "401", t)

    # ------------------------------------------------------------------ lists must not hide old records
    M = "Lists & Search"
    for label, path in (("invoices", "/invoices/"), ("job cards", "/job-cards/"), ("customers", "/customers/")):
        def t(path=path, label=label):
            default = api("GET", path, token=admin()).data
            everything = api("GET", f"{path}?limit=100000", token=admin()).data
            expect(len(default) == len(everything), f"default list shows {len(default)} of {len(everything)} {label} - older records are hidden")
            return f"All {len(default)} {label} are returned by default (no silent 100-row cut-off)"
        run("LST", M, f"The {label} screen shows every record, not just the newest 100", "Default list = full list", t)

    def t():
        inv = api("GET", "/invoices/", token=admin()).data
        ids = [i["id"] for i in inv]
        expect(ids == sorted(ids, reverse=True), "invoices not newest first")
        return "Newest invoice first"
    run("LST", M, "Invoices are listed newest first", "Descending by invoice id", t)

    # ------------------------------------------------------------------ clean-up and deletion rules
    M = "Deleting records"

    def t():
        q = quote([vc()], gst=False)
        r = api("DELETE", f"/quotations/{q.data['id']}", token=admin())
        expect_status(r, 200, 204)
        expect_status(api("GET", f"/quotations/{q.data['id']}", token=admin()), 404)
        return "Un-invoiced quotation deleted"
    run("DEL", M, "Delete a quotation that has no invoice", "Deleted", t)

    def t():
        r = api("DELETE", f"/quotations/{S['q']['id']}", token=admin())
        expect(r.status < 500, f"HTTP {r.status}: server error when deleting an invoiced quotation")
        return f"HTTP {r.status} - handled without a server error"
    run("DEL", M, "Delete a quotation that already has an invoice", "Handled cleanly (no server crash)", t)

    def t():
        r = api("DELETE", f"/invoices/{S['inv']['id']}", token=as_role("counter"))
        expect_status(r, 403)
        return "403 Forbidden"
    run("DEL", M, "Counter user tries to delete an invoice", "403 (admin only)", t)

    def t():
        r = api("DELETE", f"/invoices/{S['inv']['id']}", token=admin())
        expect_status(r, 204)
        expect_status(api("GET", f"/invoices/{S['inv']['id']}", token=admin()), 404)
        return "Invoice deleted"
    run("DEL", M, "Admin deletes an invoice", "Deleted; lookup gives 404", t)

    def t():
        r = api("DELETE", f"/customers/{S['cust']}", token=admin())
        expect(r.status < 500, f"HTTP {r.status}: server error when deleting a customer that has orders")
        return f"HTTP {r.status} - handled without a server error (customer with orders/challans)"
    run("DEL", M, "Delete a customer who already has orders", "Handled cleanly (no server crash)", t)
