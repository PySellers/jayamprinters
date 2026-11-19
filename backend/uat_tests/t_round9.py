"""Client round 9: separate Customer Name, editable final amount (round off), Credit / Debit book, Edit GST invoice (with the
bigger lettering and heavier totals on the PDF), Edit job card with and without price, A5 job card print, and the Wedding Invitation
(Screen Print / Offset) amounts, drop-downs and totals."""

import base64
import re
import uuid
import zlib
from datetime import date, timedelta

import catalog
from framework import admin, api, as_role, expect, expect_status, run

TAG = uuid.uuid4().hex[:5]
PH = str(int(TAG, 16)).zfill(8)
S = {}
PHONE_N = [0]

M_NAME = "Round 9 - Customer Name"
M_FINAL = "Round 9 - Editable final amount"
M_CD = "Round 9 - Credit / Debit book"
M_EDIT = "Round 9 - Edit invoice"
M_GST = "Round 9 - GST invoice print"
M_JOB = "Round 9 - Edit job card"
M_A5 = "Round 9 - A5 job card print"
M_INV = "Round 9 - Wedding invitations"
M_CHAT = "Round 9 - Help chat and manual"

A4 = (595.28, 841.89)
A5_LAND = (595.28, 419.53)
A4_LAND = (841.89, 595.28)


# ---------------------------------------------------------------- helpers
def pdf_text(raw):
    """The text drawn on a PDF made by our own generators (ASCII85 + Flate streams of standard fonts)."""
    parts = []
    for m in re.finditer(rb"stream\r?\n(.*?)endstream", raw, re.S):
        data = m.group(1).strip()
        try:
            if data.endswith(b"~>"):
                data = data[:-2]
            parts.append(zlib.decompress(base64.a85decode(data)).decode("latin-1"))
        except Exception:
            continue
    text = "\n".join(parts)
    # (Hello) Tj  ->  Hello
    return "\n".join(re.findall(r"\((.*?)(?<!\\)\)\s*Tj", text, re.S)).replace("\\(", "(").replace("\\)", ")")


def media_box(raw):
    m = re.search(rb"/MediaBox \[ ([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+) \]", raw)
    return (float(m.group(3)), float(m.group(4)))


def pages(raw):
    return len(re.findall(rb"/Type /Page(?!s)", raw))


def close(a, b, tol=0.02):
    return abs(a - b) <= tol


def same_size(a, b, tol=1.0):
    return abs(a[0] - b[0]) <= tol and abs(a[1] - b[1]) <= tol


def vc(qty=100, **kw):
    return catalog.item("Visiting Card", "Visiting Card", qty, [("Finish/Lamination Type", "Without Lamination"), ("Side", "Single Side")], **kw)


def new_customer(label, **extra):
    PHONE_N[0] += 1
    body = {"name": f"ZZTEST R9 {label} {TAG}", "phone": f"83{PH[:7]}{PHONE_N[0]:01d}", **extra}
    r = api("POST", "/customers/", body, admin())
    expect_status(r, 200, 201)
    return r.data


def order(items, gst=False, customer=None, jobs=True, **kw):
    cust = customer or S["cust"]
    q = api("POST", "/quotations/", dict(customer_id=cust["id"], with_gst=gst, is_order=True, items=items, **kw), admin())
    expect_status(q, 200, 201)
    expect_status(api("POST", f"/quotations/{q.data['id']}/convert", token=admin()), 200, 201)
    inv = api("POST", f"/invoices/from-quotation/{q.data['id']}", token=admin())
    expect_status(inv, 200, 201)
    job = None
    if jobs:
        job = next(j for j in api("GET", "/job-cards/", token=admin()).data if j["quotation_item_id"] == q.data["items"][0]["id"])
    return q.data, inv.data, job


def get_pdf(path, token=None):
    r = api("GET", path, token=token or admin())
    expect_status(r, 200)
    expect(r.raw[:4] == b"%PDF", "not a PDF")
    return r.raw


def edit_body(form, **kw):
    """The edit request that keeps the invoice as it is (every row as the form gave it), with changes on top."""
    body = {
        "bill_to_name": form["bill_to_name"], "bill_to_address": form["bill_to_address"], "bill_to_gstin": form["bill_to_gstin"],
        "bill_to_phone": form["bill_to_phone"], "invoice_date": form["invoice_date"], "notes": form["notes"], "final_amount": None,
        "items": form["items"],
    }
    body.update(kw)
    return body


def run_all():
    catalog.clear()
    S["cust"] = new_customer("Main", address="12 Gandhi Road, Salem", gstin="33ABCDE1234F1Z5")
    counter, production, accounts = as_role("counter"), as_role("production"), as_role("accounts")

    # ================================================================== 1) customer name
    def t():
        c = api("POST", "/customers/", {"name": f"ZZTEST R9 Shop {TAG}", "billing_person_name": f"ZZTEST R9 Person {TAG}", "phone": f"84{PH[:7]}1"}, admin())
        expect_status(c, 200, 201)
        expect(c.data["name"].endswith(f"Shop {TAG}") and c.data["billing_person_name"].endswith(f"Person {TAG}"), c.data)
        q, inv, job = order([vc(50)], customer=c.data, jobs=False)
        txt = pdf_text(get_pdf(f"/invoices/{inv['id']}/bill-pdf?bill_type=cash"))
        expect(f"ZZTEST R9 Shop {TAG}" in txt, "the customer name is not on the bill")
        expect(f"ZZTEST R9 Person {TAG}" not in txt, "the billing person name must not replace the customer name")
        u = api("PUT", f"/customers/{c.data['id']}", {"name": f"ZZTEST R9 Renamed {TAG}"}, admin())
        expect_status(u, 200)
        expect(u.data["billing_person_name"].endswith(f"Person {TAG}"), "the billing person must stay when only the customer name changes")
        return "Customer name and billing person are kept separately; the bill prints the customer name"
    run("R9N", M_NAME, "Customer Name is a field of its own, printed on the bill", "Customer name on the bill, billing person kept", t)

    # ================================================================== 2) editable final amount
    def t():
        base = api("POST", "/quotations/preview", {"with_gst": False, "items": [vc(100)]}, admin())
        expect_status(base, 200)
        calc = base.data["grand_total"]
        expect(base.data["adjustment_amount"] == 0 and close(base.data["computed_total"], calc), base.data)
        for final in (calc - 37.5, calc + 12.25, 0.0):
            r = api("POST", "/quotations/preview", {"with_gst": False, "items": [vc(100)], "final_amount": final}, admin())
            expect_status(r, 200)
            d = r.data
            expect(close(d["computed_total"], calc) and close(d["grand_total"], final) and close(d["adjustment_amount"], final - calc), d)
        expect_status(api("POST", "/quotations/preview", {"with_gst": False, "items": [vc(100)], "final_amount": -5}, admin()), 422)
        return f"Calculated total Rs.{calc}; a typed final amount becomes the total and the difference the round off (also upwards and Rs.0); a negative one is refused"
    run("R9F", M_FINAL, "The preview total follows a typed final amount", "grand_total = final, adjustment = difference", t)

    def t():
        out = []
        for gst in (False, True):
            calc = api("POST", "/quotations/preview", {"with_gst": gst, "items": [vc(100)]}, admin()).data["grand_total"]
            final = round(calc - 7.3, 2)
            q, inv, job = order([vc(100)], gst=gst, final_amount=final)
            expect(close(q["grand_total"], final) and close(q["adjustment_amount"], -7.3), (q["grand_total"], q["adjustment_amount"]))
            expect(close(inv["grand_total"], final) and close(inv["adjustment_amount"], -7.3), (inv["grand_total"], inv["adjustment_amount"]))
            if gst:
                expect(inv["tax_amount"] > 0, "the GST must stay as calculated")
            # the balance follows the final amount: pay it in full, one paisa more is refused
            over = api("POST", f"/invoices/{inv['id']}/payments", {"amount": final + 0.01, "method": "cash"}, admin())
            expect_status(over, 400)
            ok = api("POST", f"/invoices/{inv['id']}/payments", {"amount": final, "method": "cash"}, admin())
            expect_status(ok, 200)
            expect(ok.data["status"] == "paid", ok.data["status"])
            out.append(f"{'GST' if gst else 'cash'}: Rs.{calc} -> Rs.{final}")
        return "Quotation, invoice and balance follow the final amount (" + "; ".join(out) + ")"
    run("R9F", M_FINAL, "A final amount reaches the quotation, the invoice and the payments", "Invoice total = final amount; payable in full", t)

    def t():
        q, inv, _ = order([vc(100)], gst=True, jobs=False)
        expect(q["adjustment_amount"] == 0 and inv["adjustment_amount"] == 0, "no final amount means no adjustment")
        q2, inv2, _ = order([vc(100)], gst=True, jobs=False, final_amount=None)
        expect(inv2["adjustment_amount"] == 0, inv2["adjustment_amount"])
        return "Without a typed amount nothing is adjusted"
    run("R9F", M_FINAL, "No final amount = no adjustment", "adjustment 0", t)

    def t():
        calc = api("POST", "/quotations/preview", {"with_gst": True, "items": [vc(100)]}, admin()).data["grand_total"]
        q, inv, _ = order([vc(100)], gst=True, jobs=False, final_amount=round(calc - 3.1, 2))
        for url in (f"/invoices/{inv['id']}/bill-pdf?bill_type=gst", f"/invoices/{inv['id']}/pdf?format=a4", f"/invoices/{inv['id']}/pdf?format=thermal_80", f"/quotations/{q['id']}/pdf"):
            txt = pdf_text(get_pdf(url))
            expect("Round off" in txt, f"no Round off line on {url}")
        qc, invc, _ = order([vc(100)], gst=False, jobs=False, final_amount=29.0)
        expect("Round off" in pdf_text(get_pdf(f"/invoices/{invc['id']}/bill-pdf?bill_type=cash")), "cash bill")
        return "GST invoice, A4 invoice, receipt, quotation and cash bill all show the Round off / Adjustment row"
    run("R9F", M_FINAL, "Every print shows the round off line", "Round off on every PDF", t)

    # ================================================================== 3) credit / debit book
    def t():
        e = api("POST", "/credit-debit/entries", {"kind": "credit", "name": f"ZZRavi{TAG}", "amount": 1500.5, "note": "advance for banners", "entry_date": "2026-11-10"}, counter)
        expect_status(e, 201)
        expect(e.data["kind"] == "credit" and e.data["amount"] == 1500.5 and e.data["entry_date"] == "2026-11-10" and e.data["created_by"], e.data)
        d = api("POST", "/credit-debit/entries", {"kind": "debit", "name": f"ZZRavi{TAG}", "amount": 400, "note": "returned"}, counter)
        expect_status(d, 201)
        expect(d.data["entry_date"] == (date.today().isoformat()) or d.data["entry_date"], "a blank date means today")
        S["cd"] = (e.data["id"], d.data["id"])
        credits = api("GET", f"/credit-debit/entries?kind=credit&name=ZZRavi{TAG}", token=counter).data
        debits = api("GET", f"/credit-debit/entries?kind=debit&name=zzravi{TAG}", token=counter).data
        expect([x["id"] for x in credits] == [e.data["id"]] and [x["id"] for x in debits] == [d.data["id"]], (credits, debits))
        both = api("GET", f"/credit-debit/entries?name=ZZRavi{TAG}", token=counter).data
        expect(len(both) == 2, both)
        return "Credit and debit entries are saved separately with name, amount, note and date (today when blank); the name filter is not case sensitive"
    run("R9C", M_CD, "Add a credit and a debit entry", "Two separate records with name, amount, note, date", t)

    def t():
        bad = [
            ({"kind": "credit", "name": "", "amount": 10}, "empty name"),
            ({"kind": "credit", "name": "   ", "amount": 10}, "blank name"),
            ({"kind": "credit", "name": "ZZ x", "amount": 0}, "zero amount"),
            ({"kind": "debit", "name": "ZZ x", "amount": -5}, "negative amount"),
            ({"kind": "loan", "name": "ZZ x", "amount": 5}, "unknown kind"),
            ({"kind": "credit", "name": "ZZ x", "amount": "abc"}, "text amount"),
            ({"kind": "credit", "name": "ZZ x", "amount": 5, "entry_date": "31-12-2026"}, "bad date"),
            ({"kind": "credit", "name": "ZZ x", "amount": 5, "entry_date": "2099-01-01"}, "far future date"),
            ({"kind": "credit", "name": "ZZ x" * 60, "amount": 5}, "very long name"),
        ]
        for body, what in bad:
            r = api("POST", "/credit-debit/entries", body, counter)
            expect(r.status in (400, 422), f"{what} was accepted ({r.status})")
        return f"{len(bad)} wrong entries are refused (empty / blank name, zero or negative or text amount, unknown kind, bad or far date, very long name)"
    run("R9C", M_CD, "Wrong entries are refused", "400 / 422", t)

    def t():
        names = [f"ZZFlt{TAG}A", f"ZZFlt{TAG}B"]
        days = [(date.today() - timedelta(days=n)).isoformat() for n in (9, 5, 1)]
        made = []
        for nm, dy, amt, kind in ((names[0], days[0], 100, "credit"), (names[0], days[1], 250, "credit"), (names[1], days[1], 75.5, "credit"), (names[1], days[2], 60, "debit"), (names[0], days[2], 10, "debit")):
            r = api("POST", "/credit-debit/entries", {"kind": kind, "name": nm, "amount": amt, "entry_date": dy}, admin())
            expect_status(r, 201)
            made.append(r.data["id"])
        S["flt"] = made

        def ids(q):
            return sorted(x["id"] for x in api("GET", f"/credit-debit/entries?{q}", token=counter).data)
        expect(len(ids(f"kind=credit&name=ZZFlt{TAG}A")) == 2, "name filter")
        expect(ids(f"kind=credit&name=ZZFlt{TAG}&date_from={days[1]}&date_to={days[1]}") == sorted([made[1], made[2]]), "single day")
        expect(ids(f"name=ZZFlt{TAG}&date_from={days[2]}") == sorted([made[3], made[4]]), "from date only")
        expect(ids(f"name=ZZFlt{TAG}&date_to={days[0]}") == [made[0]], "to date only")
        expect(api("GET", f"/credit-debit/entries?date_from={days[2]}&date_to={days[0]}", token=counter).status == 400, "from after to")
        newest = api("GET", f"/credit-debit/entries?kind=credit&name=ZZFlt{TAG}A", token=counter).data
        expect(newest[0]["entry_date"] >= newest[1]["entry_date"], "newest first")
        s = api("GET", f"/credit-debit/summary?name=ZZFlt{TAG}", token=counter).data
        expect(close(s["credit_total"], 425.5) and close(s["debit_total"], 70) and close(s["net"], 355.5), s)
        by = {p["name"]: p for p in s["by_name"]}
        expect(close(by[names[0]]["net"], 340) and close(by[names[1]]["net"], 15.5), by)
        nm = api("GET", "/credit-debit/names", token=counter).data
        expect(names[0] in nm and names[1] in nm and nm.count(names[0]) == 1, "names list")
        return "Name filter, single day, from-only, to-only and a wrong range behave; totals and balance by name add up (credit 425.50, debit 70.00)"
    run("R9C", M_CD, "Filters by name and date, totals and balance by name", "Correct rows and sums", t)

    def t():
        cid = S["flt"][0]
        u = api("PUT", f"/credit-debit/entries/{cid}", {"name": f"ZZFlt{TAG}A", "amount": 120, "note": "corrected", "entry_date": "2026-11-01"}, counter)
        expect_status(u, 200)
        expect(u.data["amount"] == 120 and u.data["note"] == "corrected" and u.data["kind"] == "credit", u.data)
        expect_status(api("PUT", f"/credit-debit/entries/{cid}", {"name": "", "amount": 120, "entry_date": "2026-11-01"}, counter), 422)
        expect_status(api("PUT", "/credit-debit/entries/99999999", {"name": "ZZ n", "amount": 1, "entry_date": "2026-11-01"}, counter), 404)
        expect_status(api("DELETE", f"/credit-debit/entries/{cid}", token=counter), 403)
        expect_status(api("DELETE", f"/credit-debit/entries/{cid}", token=accounts), 204)
        expect_status(api("DELETE", f"/credit-debit/entries/{cid}", token=admin()), 404)
        return "An entry can be corrected (not moved to the other side); the counter cannot delete, accounts and admin can; unknown id = 404"
    run("R9C", M_CD, "Edit and delete an entry", "Saved; delete only for accounts / admin", t)

    def t():
        for who, tok in (("production", production),):
            expect_status(api("GET", "/credit-debit/entries", token=tok), 403)
            expect_status(api("POST", "/credit-debit/entries", {"kind": "credit", "name": "ZZ no", "amount": 1}, tok), 403)
        expect_status(api("GET", "/credit-debit/entries"), 401)
        for tok in (counter, accounts, admin()):
            expect_status(api("GET", "/credit-debit/summary", token=tok), 200)
        return "Production staff and anonymous callers are refused; counter, accounts and admin can use the book"
    run("R9C", M_CD, "Who can use the Credit / Debit book", "403 for production, 401 anonymous", t)

    def t():
        r = api("GET", f"/credit-debit/export?name=ZZFlt{TAG}", token=counter)
        expect_status(r, 200)
        expect(r.raw[:2] == b"PK" and "spreadsheetml" in r.ctype, "not an xlsx file")
        expect(len(r.raw) > 3000, len(r.raw))
        return "Download Excel gives a real .xlsx file (credit sheet, debit sheet, balance by name)"
    run("R9C", M_CD, "Excel copy of the book", "xlsx file", t)

    # ================================================================== 4) edit invoice
    def make_gst_invoice(**kw):
        q, inv, job = order([vc(100), dict(vc(250))], gst=True, jobs=False, **kw)
        return inv

    def t():
        inv = make_gst_invoice()
        f = api("GET", f"/invoices/{inv['id']}/edit-form", token=counter)
        expect_status(f, 200)
        d = f.data
        expect(d["with_gst"] is True and len(d["items"]) == 2 and d["bill_to_name"].startswith("ZZTEST R9 Main"), d)
        row = d["items"][0]
        expect(row["quantity"] == 100 and row["hsn_code"] and row["cgst_rate"] > 0 and row["cgst_rate"] == row["sgst_rate"] and "Visiting Card" in row["particulars"], row)
        expect(d["bill_to_gstin"] == "33ABCDE1234F1Z5" and d["bill_to_address"].startswith("12 Gandhi"), d)
        # saving the form untouched changes nothing
        r = api("PUT", f"/invoices/{inv['id']}/edit", edit_body(d), counter)
        expect_status(r, 200)
        expect(close(r.data["grand_total"], inv["grand_total"]) and close(r.data["tax_amount"], inv["tax_amount"]) and close(r.data["subtotal"], inv["subtotal"]), (r.data["grand_total"], inv["grand_total"]))
        expect(all(i["particulars"] is None for i in r.data["items"]), "an unchanged particulars text must keep following the order")
        return "The edit form shows the invoice as it prints (customer, GSTIN, rows with HSN, CGST / SGST); saving it untouched leaves every amount unchanged"
    run("R9E", M_EDIT, "Edit form starts as the invoice prints today", "Same figures after an untouched save", t)

    def t():
        inv = make_gst_invoice()
        d = api("GET", f"/invoices/{inv['id']}/edit-form", token=counter).data
        rows = [
            dict(id=d["items"][0]["id"], particulars="Visiting Card (Premium, 300 GSM)\nMatt lamination both sides", hsn_code="4911", quantity=120, unit_price=3.5, cgst_rate=9, sgst_rate=9),
            dict(id=None, particulars="Design charges", hsn_code="9983", quantity=1, unit_price=500, cgst_rate=6, sgst_rate=6),
        ]
        body = edit_body(d, bill_to_name="Sri Murugan Traders", bill_to_address="45 Market Street, Erode", bill_to_gstin="33AAAAA0000A1Z5", bill_to_phone="9876543210", invoice_date="2026-11-15", items=rows)
        pv = api("POST", f"/invoices/{inv['id']}/edit/preview", body, counter)
        expect_status(pv, 200)
        p = pv.data
        expect(close(p["lines"][0]["amount"], 420) and close(p["lines"][0]["cgst_amount"], 37.8) and close(p["lines"][0]["sgst_amount"], 37.8) and close(p["lines"][0]["total"], 495.6), p["lines"][0])
        expect(close(p["lines"][1]["amount"], 500) and close(p["lines"][1]["cgst_amount"], 30) and close(p["lines"][1]["total"], 560), p["lines"][1])
        expect(close(p["subtotal"], 920) and close(p["tax_amount"], 135.6) and close(p["computed_total"], 1055.6) and close(p["grand_total"], 1055.6) and p["adjustment_amount"] == 0, p)
        # nothing was saved by the preview
        still = api("GET", f"/invoices/{inv['id']}", token=counter).data
        expect(close(still["grand_total"], inv["grand_total"]), "the preview saved something")
        r = api("PUT", f"/invoices/{inv['id']}/edit", body, counter)
        expect_status(r, 200)
        o = r.data
        expect(close(o["grand_total"], 1055.6) and close(o["tax_amount"], 135.6) and close(o["subtotal"], 920) and o["bill_to_name"] == "Sri Murugan Traders" and str(o["invoice_date"]) == "2026-11-15", o)
        expect(len(o["items"]) == 2 and o["items"][0]["particulars"].startswith("Visiting Card (Premium") and o["items"][0]["cgst_rate"] == 9 and o["items"][1]["product_id"] is None, o["items"])
        expect(o["last_edited_by"] and o["last_edited_at"], "who edited and when")
        cust = api("GET", f"/customers/{S['cust']['id']}", token=counter).data
        expect(cust["name"].startswith("ZZTEST R9 Main") and cust["gstin"] == "33ABCDE1234F1Z5", "the customer's own record must not change")
        S["edited_inv"] = inv["id"]
        return "Customer details, date, particulars, HSN, quantity, rate, CGST % and SGST % are re-worked (subtotal 920, GST 135.60, total 1,055.60), a new row can be added, the customer record is untouched"
    run("R9E", M_EDIT, "Change customer details, date and rows of a GST invoice", "Auto recalculation, saved on the invoice only", t)

    def t():
        iid = S["edited_inv"]
        gst = pdf_text(get_pdf(f"/invoices/{iid}/bill-pdf?bill_type=gst"))
        for need in ("Sri Murugan Traders", "45 Market Street, Erode", "9876543210", "33AAAAA0000A1Z5", "15.11.2026", "Matt lamination both sides", "Design charges", "4911", "9983", "495.60", "560.00", "1055.60"):
            expect(need in gst, f"'{need}' missing on the edited GST invoice")
        expect("ZZTEST R9 Main" not in gst, "the old customer name is still printed")
        a4 = pdf_text(get_pdf(f"/invoices/{iid}/pdf?format=a4"))
        expect("Sri Murugan Traders" in a4 and "Design charges" in a4, "A4 invoice")
        th = pdf_text(get_pdf(f"/invoices/{iid}/pdf?format=thermal_80"))
        expect("Sri Murugan Traders" in th and "Design charges" in th, "receipt")
        return "The edited invoice prints with the new customer, GSTIN, date, particulars (two lines), HSN, amounts and total on the GST invoice, A4 invoice and receipt"
    run("R9E", M_EDIT, "The edit shows on the PDF and the print", "New text on every print", t)

    def t():
        inv = make_gst_invoice()
        d = api("GET", f"/invoices/{inv['id']}/edit-form", token=counter).data
        body = edit_body(d, items=[dict(d["items"][0], quantity=100, unit_price=10.0, cgst_rate=2.5, sgst_rate=2.5)] , final_amount=1000)
        r = api("PUT", f"/invoices/{inv['id']}/edit", body, counter)
        expect_status(r, 200)
        o = r.data
        expect(close(o["subtotal"], 1000) and close(o["tax_amount"], 50) and close(o["grand_total"], 1000) and close(o["adjustment_amount"], -50), o)
        f2 = api("GET", f"/invoices/{inv['id']}/edit-form", token=counter).data
        expect(f2["final_amount"] == 1000 and len(f2["history"]) == 1 and "total" in f2["history"][0]["summary"], f2["history"])
        return "A typed final amount on the edit becomes the total (round off -50.00); the edit is logged with who and what"
    run("R9E", M_EDIT, "Final amount and edit log on an invoice", "Round off kept; history recorded", t)

    def t():
        q, inv, _ = order([vc(200)], gst=True, jobs=False, discount_type="percent", discount_value=10)
        d = api("GET", f"/invoices/{inv['id']}/edit-form", token=counter).data
        r = api("PUT", f"/invoices/{inv['id']}/edit", edit_body(d, items=[dict(d["items"][0], quantity=100, unit_price=20.0, cgst_rate=9, sgst_rate=9)]), counter)
        expect_status(r, 200)
        o = r.data
        expect(close(o["subtotal"], 2000) and close(o["discount_amount"], 200) and close(o["tax_amount"], 324) and close(o["grand_total"], 2124), (o["subtotal"], o["discount_amount"], o["tax_amount"], o["grand_total"]))
        return "The order's 10% discount is kept: Rs.2,000 - 200 discount + 18% GST on the rest = Rs.2,124"
    run("R9E", M_EDIT, "The invoice discount and GST logic stay", "Discount before tax, tax on the rest", t)

    def t():
        inv = make_gst_invoice()
        d = api("GET", f"/invoices/{inv['id']}/edit-form", token=counter).data
        good = edit_body(d)
        for what, mutate in (
            ("no rows", lambda b: b.update(items=[])),
            ("quantity 0", lambda b: b["items"][0].update(quantity=0)),
            ("negative rate", lambda b: b["items"][0].update(unit_price=-1)),
            ("CGST above 50", lambda b: b["items"][0].update(cgst_rate=60)),
            ("negative SGST", lambda b: b["items"][0].update(sgst_rate=-2)),
            ("empty particulars", lambda b: b["items"][0].update(particulars="   ")),
            ("empty name", lambda b: b.update(bill_to_name="  ")),
            ("negative final", lambda b: b.update(final_amount=-1)),
        ):
            import copy
            b = copy.deepcopy(good)
            mutate(b)
            r = api("PUT", f"/invoices/{inv['id']}/edit", b, counter)
            expect(r.status in (400, 422), f"{what} was accepted ({r.status})")
        foreign = copy.deepcopy(good)
        foreign["items"][0]["id"] = 99999999
        expect_status(api("PUT", f"/invoices/{inv['id']}/edit", foreign, counter), 400)
        expect_status(api("PUT", "/invoices/99999999/edit", good, counter), 404)
        return "Wrong edits are refused: no rows, quantity 0, negative rate, GST above 50%, empty particulars or name, negative final amount, another invoice's row, unknown invoice"
    run("R9E", M_EDIT, "Wrong invoice edits are refused", "400 / 422 / 404", t)

    def t():
        inv = make_gst_invoice()
        total = inv["grand_total"]
        expect_status(api("POST", f"/invoices/{inv['id']}/payments", {"amount": total, "method": "cash"}, admin()), 200)
        d = api("GET", f"/invoices/{inv['id']}/edit-form", token=counter).data
        # the total goes up: the invoice is no longer fully paid
        up = api("PUT", f"/invoices/{inv['id']}/edit", edit_body(d, final_amount=round(total + 100, 2)), counter)
        expect_status(up, 200)
        expect(up.data["status"] == "partially_paid" and close(up.data["amount_paid"], total), up.data["status"])
        # lower than what is already received: refused with a clear message
        down = api("PUT", f"/invoices/{inv['id']}/edit", edit_body(d, final_amount=round(total - 50, 2)), counter)
        expect_status(down, 400)
        expect("already received" in str(down.data), down.data)
        # exactly what was received: paid again
        eq = api("PUT", f"/invoices/{inv['id']}/edit", edit_body(d, final_amount=total), counter)
        expect_status(eq, 200)
        expect(eq.data["status"] == "paid", eq.data["status"])
        return "Money already received is protected: a bigger total makes it partly paid, a total below the receipts is refused, equal = paid"
    run("R9E", M_EDIT, "Editing an invoice that has payments", "Status follows; cannot go below receipts", t)

    def t():
        q, inv, _ = order([vc(100)], gst=False, jobs=False)
        d = api("GET", f"/invoices/{inv['id']}/edit-form", token=accounts).data
        expect(d["with_gst"] is False, d)
        row = dict(d["items"][0], quantity=40, unit_price=5.0, cgst_rate=9, sgst_rate=9, hsn_code="1234")
        r = api("PUT", f"/invoices/{inv['id']}/edit", edit_body(d, items=[row], bill_to_name="Cash Customer Edited"), accounts)
        expect_status(r, 200)
        expect(close(r.data["grand_total"], 200) and r.data["tax_amount"] == 0, r.data)
        txt = pdf_text(get_pdf(f"/invoices/{inv['id']}/bill-pdf?bill_type=cash"))
        expect("Cash Customer Edited" in txt and "200" in txt, "cash bill")
        return "A cash bill can be edited too (quantity, rate, name); GST fields are ignored and the cash bill prints the change"
    run("R9E", M_EDIT, "Edit a cash bill", "No GST, new total, cash bill shows the change", t)

    def t():
        inv = make_gst_invoice()
        for tok, name in ((production, "production"),):
            expect_status(api("GET", f"/invoices/{inv['id']}/edit-form", token=tok), 403)
            d = api("GET", f"/invoices/{inv['id']}/edit-form", token=counter).data
            expect_status(api("POST", f"/invoices/{inv['id']}/edit/preview", edit_body(d), tok), 403)
            expect_status(api("PUT", f"/invoices/{inv['id']}/edit", edit_body(d), tok), 403)
        expect_status(api("GET", f"/invoices/{inv['id']}/edit-form"), 401)
        for tok in (counter, accounts, admin()):
            expect_status(api("GET", f"/invoices/{inv['id']}/edit-form", token=tok), 200)
        return "Production staff and anonymous callers cannot edit an invoice; counter, accounts and admin can"
    run("R9E", M_EDIT, "Who can edit an invoice", "403 production, 401 anonymous", t)

    # ================================================================== 5) GST invoice print: bigger lettering, heavier totals
    def t():
        inv = make_gst_invoice()
        d = api("GET", f"/invoices/{inv['id']}/edit-form", token=admin()).data
        pdfb = get_pdf(f"/invoices/{inv['id']}/bill-pdf?bill_type=gst")
        txt = pdf_text(pdfb)
        for need in ("INVOICE", "Particulars", "HSN", "CGST", "SGST", "Grand TOTAL", "Total Amount Before Tax", "Tax Amount (GST)", "Total Amount After Tax", "Rupees Inwords"):
            expect(need in txt, f"'{need}' missing")
        expect(same_size(media_box(pdfb), A4), media_box(pdfb))
        raw = pdfb.decode("latin-1")
        # the heavier totals use the bigger sizes: the stream has 14 pt bold figures for the grand total and 9.5 pt row figures
        stream = ""
        for m in re.finditer(rb"stream\r?\n(.*?)endstream", pdfb, re.S):
            try:
                stream += zlib.decompress(base64.a85decode(m.group(1).strip()[:-2] if m.group(1).strip().endswith(b"~>") else m.group(1).strip())).decode("latin-1")
            except Exception:
                pass
        sizes = {float(x) for x in re.findall(r"/F\d+ ([\d.]+) Tf", stream)}
        expect(any(s >= 14 for s in sizes) and any(9.4 <= s <= 9.6 for s in sizes), f"font sizes found: {sorted(sizes)}")
        return f"A4 GST invoice carries every part (INVOICE, HSN, CGST, SGST, totals, amount in words); fonts up to {max(sizes):g} pt (14 pt Grand TOTAL, 9.5 pt rows)"
    run("R9G", M_GST, "GST invoice print: bigger lettering and prominent totals", "All parts present; large sizes used", t)

    def t():
        inv = make_gst_invoice()
        d = api("GET", f"/invoices/{inv['id']}/edit-form", token=admin()).data
        many = [dict(d["items"][0], id=d["items"][0]["id"])] + [dict(id=None, particulars=f"Extra row {i}", hsn_code="4911", quantity=i + 1, unit_price=10 + i, cgst_rate=9, sgst_rate=9) for i in range(1, 29)]
        r = api("PUT", f"/invoices/{inv['id']}/edit", edit_body(d, items=many), admin())
        expect_status(r, 200)
        pdfb = get_pdf(f"/invoices/{inv['id']}/bill-pdf?bill_type=gst")
        n = pages(pdfb)
        expect(n == 3, f"29 rows should take 3 pages of 12, got {n}")
        txt = pdf_text(pdfb)
        expect(txt.count("Continued on next page") == 2 and txt.count("Grand TOTAL") == 1, "continued / totals only on the last page")
        expect("Extra row 28" in txt, "the last row is missing")
        return "29 rows run over 3 pages with 'Continued on next page' and the totals only on the last page, nothing lost"
    run("R9G", M_GST, "A long GST invoice flows over several pages", "3 pages, totals on the last", t)

    # ================================================================== 6) edit job card, with and without price
    def job_with(remarks=None):
        notes = remarks
        q, inv, job = order([vc(100, notes=notes)], gst=False)
        return q, inv, job

    def t():
        q, inv, job = job_with()
        jid = job["id"]
        sh = api("GET", f"/job-cards/{jid}/sheet", token=counter)
        expect_status(sh, 200)
        sheet = sh.data["sheet"]
        sheet.update(party_name="Edited Party Ltd", mobile="9000011111", job_name="Edited job name", size="A5 landscape", remarks="Edited remarks line",
                     proof1_date="2026-12-01", proof1_time="10:30", delivery_date="2026-12-05", delivery_time="17:00", cutting_size="Edited cut")
        sheet["paper"][0].update(range="Edited paper", kgs="300 GSM", colour="Cream", qty="777", printing="Both side")
        sheet["printing_colours"] = ["Royal Blue", "Black"]
        sheet["serial_from_to"] = "1001 - 1500"
        sheet["book_from_to"] = "1 - 10"
        r = api("PUT", f"/job-cards/{jid}/sheet", {"sheet": sheet}, counter)
        expect_status(r, 200)
        back = api("GET", f"/job-cards/{jid}/sheet", token=production).data["sheet"]
        for k in ("party_name", "mobile", "job_name", "size", "remarks", "proof1_date", "proof1_time", "delivery_date", "delivery_time"):
            expect(back[k] == sheet[k], (k, back[k], sheet[k]))
        expect(back["paper"][0]["range"] == "Edited paper" and back["paper"][0]["qty"] == "777" and back["printing_colours"] == ["Royal Blue", "Black"], back["paper"])
        for wp in ("false", "true"):
            txt = pdf_text(get_pdf(f"/job-cards/{jid}/sheet-pdf?with_price={wp}"))
            for need in ("Edited Party Ltd", "9000011111", "Edited job name", "A5 landscape", "Edited remarks line", "Edited paper", "777", "01/12/2026", "05/12/2026", "Royal Blue"):
                expect(need in txt, f"'{need}' missing on the job card (with_price={wp})")
        jobs_row = next(j for j in api("GET", "/job-cards/", token=admin()).data if j["id"] == jid)
        expect(str(jobs_row["delivery_date"]) == "2026-12-05", "the list's delivery column must follow the edited delivery date")
        S["jc"] = (jid, q, inv)
        return "Party, mobile, job name, size, proofs, delivery, paper, colours, numbers and remarks are saved and printed on both job cards; the list's delivery date follows"
    run("R9J", M_JOB, "Edit the job card form and print it", "Saved values on both prints", t)

    def t():
        jid, q, inv = S["jc"]
        sh = api("GET", f"/job-cards/{jid}/sheet", token=counter).data
        lines = sh["price_lines"]
        expect(len(lines) >= 1 and sh["price_edited"] is False, sh["price_edited"])
        edited = [dict(l) for l in lines]
        edited[0]["label"] = "Edited rate line"
        edited[0]["amount"] = 1234.5
        edited.append({"label": "Courier to Salem", "detail": "by hand", "amount": 55})
        r = api("PUT", f"/job-cards/{jid}/sheet", {"sheet": {**sh["sheet"], "price_lines": edited}}, counter)
        expect_status(r, 200)
        expect(r.data["price_edited"] is True and r.data["price_lines"][0]["label"] == "Edited rate line" and len(r.data["price_lines"]) == len(lines) + 1, r.data["price_lines"])
        withp = pdf_text(get_pdf(f"/job-cards/{jid}/sheet-pdf?with_price=true"))
        expect("Edited rate line" in withp and "1,234.50" in withp and "Courier to Salem" in withp, "edited price list on the paper card with price")
        without = pdf_text(get_pdf(f"/job-cards/{jid}/sheet-pdf?with_price=false"))
        expect("Courier to Salem" not in without and "Edited rate line" not in without, "prices must not appear on the card without price")
        detail = pdf_text(get_pdf(f"/job-cards/{jid}/pdf?with_price=true"))
        expect("Courier to Salem" in detail, "the detailed job card with price must show the edited lines")
        detail_np = pdf_text(get_pdf(f"/job-cards/{jid}/pdf?with_price=false"))
        expect("Courier to Salem" not in detail_np, "no prices on the card without price")
        # saving the form again without price_lines keeps them; null brings back the order's list
        keep = api("PUT", f"/job-cards/{jid}/sheet", {"sheet": r.data["sheet"]}, counter)
        expect(keep.data["price_edited"] is True and len(keep.data["price_lines"]) == len(lines) + 1, "kept")
        back = api("PUT", f"/job-cards/{jid}/sheet", {"sheet": {**r.data["sheet"], "price_lines": None}}, counter)
        expect(back.data["price_edited"] is False and [l["label"] for l in back.data["price_lines"]] == [l["label"] for l in lines], back.data["price_lines"])
        return "The price list of the card with price can be edited (change, add): it prints on both with-price job cards, never on the one without price, and 'back to the order's list' restores it"
    run("R9J", M_JOB, "Edit the pricing of the job card with price", "Edited lines only on the with-price copies", t)

    def t():
        jid, _, _ = S["jc"]
        sh = api("GET", f"/job-cards/{jid}/sheet", token=counter).data
        base = {**sh["sheet"]}
        too_many = [{"label": f"L{i}", "detail": "", "amount": 1} for i in range(41)]
        expect_status(api("PUT", f"/job-cards/{jid}/sheet", {"sheet": {**base, "price_lines": too_many}}, counter), 400)
        expect_status(api("PUT", f"/job-cards/{jid}/sheet", {"sheet": {**base, "price_lines": [{"label": "x", "amount": "abc"}]}}, counter), 400)
        expect_status(api("PUT", f"/job-cards/{jid}/sheet", {"sheet": {**base, "price_lines": "nope"}}, counter), 400)
        ok = api("PUT", f"/job-cards/{jid}/sheet", {"sheet": {**base, "price_lines": [{"label": "", "detail": "", "amount": 0}, {"label": "Only line", "detail": "", "amount": 10}]}}, counter)
        expect_status(ok, 200)
        expect([l["label"] for l in ok.data["price_lines"]] == ["Only line"], "blank lines are dropped")
        api("PUT", f"/job-cards/{jid}/sheet", {"sheet": {**base, "price_lines": None}}, counter)
        return "More than 40 lines, a text amount or a non-list price list is refused; blank lines are dropped"
    run("R9J", M_JOB, "Price list edits are validated", "400 for wrong lists", t)

    # ================================================================== 7) A5 job cards
    def t():
        jid, _, _ = S["jc"]
        out = []
        for name, url in (("paper card without price", f"/job-cards/{jid}/sheet-pdf?with_price=false"), ("paper card with price", f"/job-cards/{jid}/sheet-pdf?with_price=true"),
                          ("job card without price", f"/job-cards/{jid}/pdf?with_price=false"), ("job card with price", f"/job-cards/{jid}/pdf?with_price=true")):
            b = get_pdf(url)
            expect(same_size(media_box(b), A5_LAND), f"{name}: {media_box(b)}")
            out.append(name)
        b4 = get_pdf(f"/job-cards/{jid}/sheet-pdf?with_price=true&size=a4")
        expect(same_size(media_box(b4), A4_LAND), media_box(b4))
        b4d = get_pdf(f"/job-cards/{jid}/pdf?with_price=true&size=a4")
        expect(same_size(media_box(b4d), A4_LAND), media_box(b4d))
        expect_status(api("GET", f"/job-cards/{jid}/sheet-pdf?size=a3", token=admin()), 422)
        return "All four job card prints are A5 landscape (210 x 148 mm); size=a4 still gives the full sheet; any other size is refused"
    run("R9A", M_A5, "Both job cards print on A5 landscape", "MediaBox 595 x 420 pt", t)

    def t():
        long_notes = " ".join(f"Instruction number {i} about the design, the paper and the finishing of this job." for i in range(1, 80))
        q, inv, job = job_with(remarks=long_notes)
        jid = job["id"]
        sh = api("GET", f"/job-cards/{jid}/sheet", token=counter).data
        lines = [{"label": f"Price part {i}", "detail": "", "amount": 10 + i} for i in range(1, 36)]
        expect_status(api("PUT", f"/job-cards/{jid}/sheet", {"sheet": {**sh["sheet"], "price_lines": lines}}, counter), 200)
        for wp in ("false", "true"):
            b = get_pdf(f"/job-cards/{jid}/sheet-pdf?with_price={wp}")
            expect(pages(b) == 1 and same_size(media_box(b), A5_LAND), f"the paper card must stay on one A5 page (pages={pages(b)})")
            txt = pdf_text(b)
            expect("Instruction number 1 " in txt, "remarks start missing")
            # nothing is cut silently: either everything is there or it says more notes are on the screen
            expect("Instruction number 79" in txt or "more notes on the job detail screen" in txt, "long remarks were cut without a note")
        b = get_pdf(f"/job-cards/{jid}/sheet-pdf?with_price=true")
        txt = pdf_text(b)
        total_listed = sum(l["amount"] for l in lines)
        expect("Other (" in txt, "a long price list must fold the last lines into one so that nothing runs off the card")
        d = get_pdf(f"/job-cards/{jid}/pdf?with_price=true")
        dt = pdf_text(d)
        expect("Price part 35" in dt and pages(d) >= 2, f"the detailed card flows over pages (pages={pages(d)})")
        return "Very long remarks and a 35-line price list never overflow the A5 paper card (one page, shrunk text, folded lines or a note); the detailed card flows over pages"
    run("R9A", M_A5, "Long content fits the A5 page (no cut-off)", "One page, nothing silently lost", t)

    def t():
        # a bill book job: copy rows, margin and numbering, with long names
        q, inv, job = order([catalog.item("Bill Books & Stationery", "Sheet Printing - 1/4", 500, [("Document Type", "Bill Book"), ("Paper Name", "Excel Bond"), ("Paper/GSM Type", "80 GSM"), ("Copies per Set", "1+3")])], gst=False)
        for wp in ("false", "true"):
            b = get_pdf(f"/job-cards/{job['id']}/sheet-pdf?with_price={wp}")
            txt = pdf_text(b)
            expect(pages(b) == 1 and same_size(media_box(b), A5_LAND), f"pages={pages(b)}")
            for need in ("1st Copy", "2nd Copy", "3rd Copy", "4th Copy", "Printing Colour", "Margin", "No Details", "Job Position"):
                expect(need in txt, f"'{need}' missing on the A5 bill book card")
        return "The fullest form (bill book with 4 copies, colours, margin, numbering) still fits one A5 page with every part present"
    run("R9A", M_A5, "The fullest job card form fits A5", "All parts on one page", t)

    # ================================================================== 8) wedding invitations
    CAT = "Invitation & Greeting Cards"
    screen = catalog.product(CAT, "Wedding Invitation - Screen Print")
    offset = catalog.product(CAT, "Wedding Invitation - Offset")
    attrs = {a["name"]: a for a in api("GET", f"/attributes/?category_id={screen['category_id']}", token=admin()).data}

    def opt(attr, val):
        o = next(x for x in attrs[attr]["options"] if x["value"] == val)
        return dict(attribute_id=attrs[attr]["id"], attribute_option_id=o["id"])

    def screen_item(qty=500, occasion="Wedding Invitation", method="Invitation", **kw):
        sel = [opt("Screen Print", occasion), opt("Method", method), opt("Paper/Board Type", "Nil"), opt("Side", "Single Side")]
        return dict(product_id=screen["id"], quantity=qty, selected_options=sel, **kw)

    def t():
        expect(screen.get("allow_manual_amounts") is True and offset.get("allow_manual_amounts") is True, "the two items allow typed amounts")
        sp = attrs["Screen Print"]
        expect(sp["product_id"] == screen["id"] and [o["value"] for o in sp["options"]] == ["Wedding Invitation", "House Warming", "Baby Shower", "Birthday", "Custom"], sp)
        me = attrs["Method"]
        expect(me["product_id"] == screen["id"] and [o["value"] for o in me["options"]] == ["Invitation", "Thamboolam Bag", "Visiting Card", "Pen", "Diary", "Custom"], me)
        sz = attrs["Size"]
        expect(sz["product_id"] == offset["id"] and [o["value"] for o in sz["options"]] == ["A5", "A4", "Custom"], sz)
        expect("Nil" in [o["value"] for o in attrs["Paper/Board Type"]["options"]], "Nil paper option")
        expect(all(a["in_price_matrix"] is False for a in (sp, me, sz)), "the new drop-downs are not part of the price grid")
        mc = catalog.product(CAT, "Multicolor Card")
        expect(not mc.get("allow_manual_amounts"), "other items do not allow typed amounts")
        return "Screen Print (5 occasions), Method (6) and Size (3) exist, each only for its own item; Paper/Board Type has Nil; the two invitation items allow typed amounts"
    run("R9I", M_INV, "The new drop-downs and options exist", "Occasion, method, size, Nil", t)

    def t():
        per = api("POST", "/quotations/preview", {"with_gst": False, "items": [screen_item(500, card_amount=12.5, card_amount_mode="per_card", printing_charge_manual=1500)]}, admin())
        expect_status(per, 200)
        it = per.data["items"][0]
        expect(it["priceable"] and close(it["total_price"], 12.5 * 500 + 1500), it)
        kinds = {b["kind"]: b["amount"] for b in it["breakdown"]}
        expect(close(kinds["card"], 6250) and close(kinds["printing"], 1500), kinds)
        expect(close(it["unit_price"], (6250 + 1500) / 500), it["unit_price"])
        tot = api("POST", "/quotations/preview", {"with_gst": False, "items": [screen_item(500, card_amount=6000, card_amount_mode="total", printing_charge_manual=900)]}, admin()).data["items"][0]
        expect(close(tot["total_price"], 6900), tot)
        default_mode = api("POST", "/quotations/preview", {"with_gst": False, "items": [screen_item(100, card_amount=10, printing_charge_manual=0)]}, admin()).data["items"][0]
        expect(close(default_mode["total_price"], 1000), "a blank mode means per card")
        only_print = api("POST", "/quotations/preview", {"with_gst": False, "items": [screen_item(100, card_amount=10)]}, admin()).data["items"][0]
        expect(only_print["priceable"] and only_print["total_price"] >= 1000, "only the card amount typed: the printing charge comes from the price list")
        return "Total = card amount + printing charge, with the card amount per card (12.50 x 500 + 1,500 = 7,750) or for the whole order (6,000 + 900 = 6,900)"
    run("R9I", M_INV, "Typed card amount and printing charge make the total", "card + printing", t)

    def t():
        item = screen_item(500, occasion="Custom", method="Custom", card_amount=12.5, card_amount_mode="per_card", printing_charge_manual=1500,
                           option_texts={str(attrs["Screen Print"]["id"]): "Engagement", str(attrs["Method"]["id"]): "Return gift box"})
        calc = api("POST", "/quotations/preview", {"with_gst": True, "items": [item]}, admin()).data
        q, inv, job = order([item], gst=True, final_amount=round(calc["grand_total"] + 20, 2))
        qi = q["items"][0]
        expect(qi["card_amount"] == 12.5 and qi["card_amount_mode"] == "per_card" and qi["printing_charge_manual"] == 1500 and qi["option_texts"], qi)
        expect(close(qi["total_price"], 7750), qi["total_price"])
        ii = inv["items"][0]
        expect(close(ii["total_price"], 7750) and ii["card_amount"] == 12.5 and ii["option_texts"][str(attrs["Screen Print"]["id"])] == "Engagement", ii)
        expect(close(inv["subtotal"], 7750) and close(inv["grand_total"], calc["grand_total"] + 20), (inv["subtotal"], inv["grand_total"]))
        specs = {s["label"]: s["value"] for s in api("GET", f"/job-cards/{job['id']}/detail", token=admin()).data["specs"]}
        expect(specs["Screen Print"] == "Engagement" and specs["Method"] == "Return gift box", specs)
        gst = pdf_text(get_pdf(f"/invoices/{inv['id']}/bill-pdf?bill_type=cash"))  # the wide particulars column keeps each phrase on one line
        expect("Engagement" in gst and "Return gift box" in gst and "Card Rs.6,250.00" in gst, "the typed occasion / method and the card amount on the bill")
        quote = pdf_text(get_pdf(f"/quotations/{q['id']}/pdf"))
        expect("Engagement" in quote, "quotation PDF")
        card = pdf_text(get_pdf(f"/job-cards/{job['id']}/sheet-pdf?with_price=true"))
        expect("Wedding Invitation - Screen Print" in card or "Invitation" in card, "job card")
        form = api("GET", f"/invoices/{inv['id']}/edit-form", token=admin()).data
        expect("Engagement" in form["items"][0]["particulars"], form["items"][0]["particulars"])
        return "A typed occasion and method ('Engagement', 'Return gift box') and the amounts flow from the quote to the job card, the invoice, the bill, the quotation PDF and the edit form; the total equals card + printing (+ typed final amount)"
    run("R9I", M_INV, "Typed 'Custom' texts and amounts reach every document", "Same total and text everywhere", t)

    def t():
        item = dict(product_id=offset["id"], quantity=300, selected_options=[opt("Size", "A4"), opt("Paper/Board Type", "Art Board"), opt("Side", "Both Side")], card_amount=20, printing_charge_manual=800)
        pv = api("POST", "/quotations/preview", {"with_gst": False, "items": [item]}, admin()).data
        expect(close(pv["items"][0]["total_price"], 6800) and close(pv["grand_total"], 6800), pv)
        q, inv, job = order([item], gst=False)
        expect(close(inv["grand_total"], 6800), inv["grand_total"])
        specs = {s["label"]: s["value"] for s in api("GET", f"/job-cards/{job['id']}/detail", token=admin()).data["specs"]}
        expect(specs["Size"] == "A4", specs)
        custom = dict(item, selected_options=[opt("Size", "Custom"), opt("Paper/Board Type", "Nil"), opt("Side", "Both Side")], option_texts={str(attrs["Size"]["id"]): "6 x 9 inch"})
        _, inv2, job2 = order([custom], gst=False)
        specs2 = {s["label"]: s["value"] for s in api("GET", f"/job-cards/{job2['id']}/detail", token=admin()).data["specs"]}
        expect(specs2["Size"] == "6 x 9 inch", specs2)
        return "Offset: Size A4 / typed Custom size, card Rs.20 x 300 + printing Rs.800 = Rs.6,800 on the preview, the invoice and the job card"
    run("R9I", M_INV, "Wedding Invitation - Offset size and total", "Rs.6,800 everywhere; size on the job card", t)

    def t():
        mc = catalog.product(CAT, "Multicolor Card")
        sel = [dict(attribute_id=attrs["Paper/Board Type"]["id"], attribute_option_id=next(o["id"] for o in attrs["Paper/Board Type"]["options"] if o["value"] == "Art Board")), opt("Side", "Both Side")]
        plain = api("POST", "/quotations/preview", {"with_gst": False, "items": [dict(product_id=mc["id"], quantity=100, selected_options=sel)]}, admin()).data["items"][0]
        typed = api("POST", "/quotations/preview", {"with_gst": False, "items": [dict(product_id=mc["id"], quantity=100, selected_options=sel, card_amount=1, printing_charge_manual=1)]}, admin()).data["items"][0]
        expect(close(plain["total_price"], typed["total_price"]), "typed amounts are ignored for an item that does not allow them")
        for bad in ({"card_amount": -1}, {"printing_charge_manual": -5}, {"card_amount_mode": "weird", "card_amount": 5}):
            r = api("POST", "/quotations/preview", {"with_gst": False, "items": [screen_item(100, **bad)]}, admin())
            expect(r.status in (400, 422), f"{bad} was accepted")
        return "Items that do not allow typed amounts ignore them; negative amounts or an unknown mode are refused"
    run("R9I", M_INV, "Typed amounts only where the item allows them", "Ignored elsewhere; wrong values refused", t)

    def t():
        item = next(p for p in api("GET", "/products/?limit=2000", token=admin()).data if p["id"] == offset["id"])
        u = api("PUT", f"/products/{offset['id']}", {"allow_manual_amounts": False}, admin())
        expect_status(u, 200)
        expect(u.data["allow_manual_amounts"] is False, u.data)
        expect_status(api("PUT", f"/products/{offset['id']}", {"allow_manual_amounts": True}, production), 403)
        back = api("PUT", f"/products/{offset['id']}", {"allow_manual_amounts": True}, admin())
        expect(back.data["allow_manual_amounts"] is True, back.data)
        # an attribute can be limited to one item (and set back)
        mine = api("POST", "/attributes/", {"category_id": screen["category_id"], "name": f"ZZ Scoped {TAG}", "product_id": offset["id"], "in_price_matrix": False}, admin())
        expect_status(mine, 200, 201)
        expect(mine.data["product_id"] == offset["id"] and mine.data["in_price_matrix"] is False, mine.data)
        un = api("PUT", f"/attributes/{mine.data['id']}", {"product_id": None}, admin())
        expect(un.data["product_id"] is None, un.data)
        api("DELETE", f"/attributes/{mine.data['id']}", token=admin())
        return "The admin can switch typed amounts on / off for an item (employees cannot) and limit a drop-down to one item"
    run("R9I", M_INV, "Admin setup of typed amounts and item-only drop-downs", "Saved by admin; 403 for others", t)

    # ================================================================== 9) help chat
    def ask(q):
        r = api("POST", "/assistant/ask", {"question": q}, counter)
        expect_status(r, 200)
        return r.data

    def t():
        cases = {
            "how do I change the total amount of an order": ("Final amount", "/dashboard"),
            "can I round off the bill total": ("Round off", "/dashboard"),
            "how do I edit a gst invoice": ("Edit", "/invoices"),
            "I entered a wrong gstin in the invoice, how to correct": ("GSTIN", "/invoices"),
            "where do I note credit and debit amounts": ("Credit / Debit", "/credit-debit"),
            "how to filter debit entries by name and date": ("filters", "/credit-debit"),
            "how do I edit a job card": ("Edit job card", "/job-cards"),
            "can I change the price on the job card with price": ("price list", "/job-cards"),
            "what size do job cards print": ("A5", "/job-cards"),
            "how to type the card amount and printing charge for wedding invitation": ("Card Amount", "/dashboard"),
            "screen print house warming baby shower option": ("House Warming", "/dashboard"),
            "where is the customer name field when I start a new order": ("Customer Name", "/dashboard"),
        }
        bad = []
        for q, (word, link) in cases.items():
            r = ask(q)
            if not (r["found"] and word.lower() in r["answer"].lower() and r["link"] == link):
                bad.append((q, r["found"], r["link"], r["answer"][:80]))
        expect(not bad, bad)
        return f"{len(cases)} questions about the new features all reach the right answer and page"
    run("R9H", M_CHAT, "The help chat knows the round 9 features", "Right answer and link", t)

    def t():
        r = api("GET", "/auth/about", token=admin())
        expect(r.data["version"] == "1.5.1", r.data)
        return "About shows version 1.5.1"
    run("R9H", M_CHAT, "Version 1.5.1", "Version in About", t)
