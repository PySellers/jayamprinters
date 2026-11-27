"""Client round 11 (ten requests): delivery on or after the last proof, any number of proofs, several jobs on one invoice, overdue
payments, Outsource for the staff login, bill book naming, job cards in number order, every option on the paper job card and the
A4 invoice in Sri Jayam's own bill format (with HSN)."""

import uuid
from datetime import date, timedelta

import catalog
from framework import admin, api, as_role, expect, expect_status, run
import t_round9
from t_round9 import get_pdf, media_box, order, pdf_text, same_size, vc, new_customer, A4

TAG = uuid.uuid4().hex[:5]
M_PR = "Round 11 - Proofs and delivery date"
M_MJ = "Round 11 - Several jobs, one invoice"
M_DU = "Round 11 - Overdue payments"
M_OS = "Round 11 - Outsource for the staff login"
M_BB = "Round 11 - Bill book naming on the invoice"
M_JC = "Round 11 - Job card list and paper job card"
M_IN = "Round 11 - Invoice bill format and HSN"


def iso(offset):
    return (date.today() + timedelta(days=offset)).isoformat()


def bill_book(qty=100, doc="Bill Book"):
    return catalog.item("Bill Books & Stationery", "Sheet Printing - 1/4", qty, [("Document Type", doc), ("Paper Name", "Excel Bond"), ("Paper/GSM Type", "80 GSM"), ("Copies per Set", "1+2")])


def run_all():
    catalog.clear()
    t_round9.S["cust"] = new_customer("Main11", address="12 Gandhi Road, Salem", gstin="33ABCDE1234F1Z5")
    cust = t_round9.S["cust"]
    counter, production, accounts = as_role("counter"), as_role("production"), as_role("accounts")

    def make(items, gst=False, jobs=True, **kw):
        return order(items, gst=gst, jobs=jobs, **kw)

    # ================================================================== 1) + 2) proofs and delivery
    def t():
        q, inv, job = make([vc(50)], proof1_date=iso(1), proof1_time="10:00", proof2_date=iso(2), proof2_time="11:00",
                           extra_proofs=[{"date": iso(3), "time": "12:00"}, {"date": iso(4)}, {"date": iso(5), "time": "09:30"}], delivery_date=iso(5))
        expect([p["date"] for p in q["extra_proofs"]] == [iso(3), iso(4), iso(5)], q["extra_proofs"])
        proofs = api("GET", f"/job-cards/{job['id']}/proofs", token=counter).data
        expect([p["number"] for p in proofs] == [1, 2, 3, 4, 5], [p["number"] for p in proofs])
        expect([p["due_date"] for p in proofs] == [iso(1), iso(2), iso(3), iso(4), iso(5)], proofs)
        expect(proofs[2]["due_time"] == "12:00" and proofs[3]["due_time"] is None and proofs[4]["due_time"] == "09:30", proofs)
        expect(str(job["delivery_date"]) == iso(5), job["delivery_date"])
        sh = api("GET", f"/job-cards/{job['id']}/sheet", token=counter).data["sheet"]
        expect(sh["delivery_date"] == iso(5), sh["delivery_date"])
        return "An order with five proofs makes five proofs on the job card (Proof 1 ... 5, with their times); delivery on the last proof's day"
    run("R11P", M_PR, "Add n proofs when the order is taken", "Proof 1..5 on the job card", t)

    def t():
        body = dict(customer_id=cust["id"], with_gst=False, is_order=True, items=[vc(50)], proof1_date=iso(1), proof2_date=iso(3), extra_proofs=[{"date": iso(6)}])
        r = api("POST", "/quotations/", {**body, "delivery_date": iso(5)}, admin())
        expect_status(r, 400)
        expect("cannot be before the last proof" in str(r.data), r.data)
        same = api("POST", "/quotations/", {**body, "delivery_date": iso(6)}, admin())
        expect_status(same, 200, 201)
        later = api("POST", "/quotations/", {**body, "delivery_date": iso(9)}, admin())
        expect_status(later, 200, 201)
        none = api("POST", "/quotations/", {**body, "extra_proofs": [], "proof2_date": None}, admin())
        expect_status(none, 200, 201)
        old = api("POST", "/quotations/", {**body, "delivery_date": iso(0), "proof2_date": None, "extra_proofs": []}, admin())
        expect_status(old, 400)
        return "Delivery before the last proof is refused with a clear message; the same day or later is accepted"
    run("R11P", M_PR, "Delivery on or after the last proof (order)", "400 before; 200 same day / later", t)

    def t():
        q, inv, job = make([vc(50)], proof1_date=iso(1), delivery_date=iso(2))
        a = api("POST", f"/job-cards/{job['id']}/proofs", {"due_date": iso(7), "due_time": "10:00"}, counter)
        expect_status(a, 201)
        expect(a.data["number"] == 2 and a.data["delivery_moved_to"] == iso(7), a.data)
        j = next(x for x in api("GET", "/job-cards/", token=counter).data if x["id"] == job["id"])
        expect(str(j["delivery_date"]) == iso(7), j["delivery_date"])
        sh = api("GET", f"/job-cards/{job['id']}/sheet", token=counter).data["sheet"]
        expect(sh["delivery_date"] == iso(7), "the job card form follows")
        # a proof that is still before the delivery changes nothing
        b = api("POST", f"/job-cards/{job['id']}/proofs", {"due_date": iso(4)}, counter)
        expect(b.data["delivery_moved_to"] is None, b.data)
        # moving a proof later than the delivery moves the delivery again; earlier does not pull it back
        u = api("PUT", f"/job-proofs/{b.data['id']}", {"due_date": iso(10)}, counter)
        expect(u.data["delivery_moved_to"] == iso(10), u.data)
        back = api("PUT", f"/job-proofs/{b.data['id']}", {"due_date": iso(3)}, counter)
        expect(back.data["delivery_moved_to"] is None, back.data)
        j2 = next(x for x in api("GET", "/job-cards/", token=counter).data if x["id"] == job["id"])
        expect(str(j2["delivery_date"]) == iso(10), "delivery stays where it was moved")
        return "A proof added or moved after the delivery date moves the delivery to that day (the job card form follows); an earlier proof changes nothing"
    run("R11P", M_PR, "Delivery follows the last proof on the job card", "Moved to the proof's day", t)

    def t():
        q, inv, job = make([vc(50)], proof1_date=iso(1), delivery_date=iso(3))
        jid = job["id"]
        sh = api("GET", f"/job-cards/{jid}/sheet", token=counter).data["sheet"]
        bad = api("PUT", f"/job-cards/{jid}/sheet", {"sheet": {**sh, "proof1_date": iso(5), "delivery_date": iso(3)}}, counter)
        expect_status(bad, 400)
        expect("cannot be before the last proof" in str(bad.data), bad.data)
        more = api("PUT", f"/job-cards/{jid}/sheet", {"sheet": {**sh, "more_proofs": [{"date": iso(8), "time": ""}], "delivery_date": iso(3)}}, counter)
        expect_status(more, 400)
        ok = api("PUT", f"/job-cards/{jid}/sheet", {"sheet": {**sh, "proof1_date": iso(5), "delivery_date": iso(5)}}, counter)
        expect_status(ok, 200)
        # the job update checks against the proofs of the job
        q2, inv2, job2 = make([vc(50)], proof1_date=iso(4), delivery_date=iso(6))
        expect_status(api("PUT", f"/job-cards/{job2['id']}", {"delivery_date": iso(2)}, counter), 400)
        expect_status(api("PUT", f"/job-cards/{job2['id']}", {"delivery_date": iso(4)}, counter), 200)
        return "The job card form and the job update refuse a delivery date before the last proof (also with extra proof lines)"
    run("R11P", M_PR, "Delivery on or after the last proof (job card)", "400 before; 200 same day", t)

    # ================================================================== 3) several jobs, one invoice
    def t():
        xer = catalog.item("Xerox / Photocopy", "Xerox / Photocopy", 100, [("Paper Size", "A4"), ("Colour", "Black & White"), ("Print Side", "Single Side")])
        q = api("POST", "/quotations/", dict(customer_id=cust["id"], with_gst=True, is_order=True, items=[vc(100), xer, bill_book(200)], proof1_date=iso(1), delivery_date=iso(3)), admin())
        expect_status(q, 200, 201)
        expect_status(api("POST", f"/quotations/{q.data['id']}/convert", token=admin()), 200, 201)
        inv = api("POST", f"/invoices/from-quotation/{q.data['id']}", token=admin())
        expect_status(inv, 200, 201)
        jobs = [j for j in api("GET", "/job-cards/", token=admin()).data if j["quotation_item_id"] in {i["id"] for i in q.data["items"]}]
        expect(len(jobs) == 3 and len({j["job_number"] for j in jobs}) == 3, f"{len(jobs)} job cards")
        expect(len(inv.data["items"]) == 3, "one invoice with three rows")
        expect(api("POST", f"/invoices/from-quotation/{q.data['id']}", token=admin()).status == 400, "only one invoice per order")
        mine = [i for i in api("GET", "/invoices/", token=admin()).data if i["quotation_id"] == q.data["id"]]
        expect(len(mine) == 1, "one invoice for the order")
        txt = pdf_text(get_pdf(f"/invoices/{inv.data['id']}/bill-pdf?bill_type=gst"))
        for need in ("Visiting Card", "Xerox", "Bill Book"):
            expect(need in txt, f"'{need}' missing on the one bill")
        t_round11_S["multi"] = (q.data, inv.data, jobs)
        return "An order of three different jobs makes three job cards (their own numbers) and ONE invoice / bill with three rows"
    t_round11_S = {}
    run("R11M", M_MJ, "Several jobs of one customer: a job card each, one invoice", "3 job cards, 1 invoice, 3 bill rows", t)

    def t():
        q, inv, jobs = t_round11_S["multi"]
        d = [api("GET", f"/job-cards/{j['id']}/detail", token=counter).data for j in jobs]
        names = sorted(x["job"]["item"] for x in d)
        expect(len(set(names)) == 3, names)
        # every job card prints on its own paper card
        for j in jobs:
            b = get_pdf(f"/job-cards/{j['id']}/sheet-pdf?with_price=false")
            expect(b[:4] == b"%PDF", "paper card")
        return "Each of the three jobs opens and prints as its own job card (" + ", ".join(names) + ")"
    run("R11M", M_MJ, "Every job has its own job card", "3 different job cards", t)

    # ================================================================== 4) overdue payments
    def t():
        q, inv, job = make([vc(100)], jobs=False)
        iid = inv["id"]
        total = inv["grand_total"]
        expect_status(api("PATCH", f"/invoices/{iid}", {"pay_by_date": iso(-3)}, counter), 200)
        dues = api("GET", "/invoices/dues", token=counter).data
        row = next(r for r in dues if r["invoice_id"] == iid)
        expect(row["state"] == "overdue" and row["days_left"] == -3 and abs(row["balance"] - total) < 0.01, row)
        # part payment: still owed, still overdue until the new promise is set
        part = api("POST", f"/invoices/{iid}/payments", {"amount": round(total / 2, 2), "method": "upi", "upi_id": "cust@upi"}, counter)
        expect_status(part, 200)
        row = next(r for r in api("GET", "/invoices/dues", token=counter).data if r["invoice_id"] == iid)
        expect(abs(row["balance"] - (total - round(total / 2, 2))) < 0.01 and row["state"] == "overdue", row)
        expect_status(api("PATCH", f"/invoices/{iid}", {"pay_by_date": iso(5)}, counter), 200)
        row = next((r for r in api("GET", "/invoices/dues?within_days=10", token=counter).data if r["invoice_id"] == iid), None)
        expect(row and row["state"] == "upcoming", row)
        # the rest is paid: the customer leaves the list and the invoice is paid
        rest = api("POST", f"/invoices/{iid}/payments", {"amount": round(total - round(total / 2, 2), 2), "method": "cash"}, counter)
        expect_status(rest, 200)
        expect(rest.data["status"] == "paid", rest.data["status"])
        expect(all(r["invoice_id"] != iid for r in api("GET", "/invoices/dues?within_days=30", token=counter).data), "a paid invoice must leave the Payments due list")
        return "An overdue invoice shows on the list; a part payment lowers the balance, a new promised day moves it to upcoming; full payment removes it and marks the bill paid"
    run("R11D", M_DU, "Overdue customer pays (part, then the rest)", "Balance and status follow each payment", t)

    # ================================================================== 5) outsource for the staff login
    def t():
        body = {"vendor_name": f"ZZTEST Press {TAG}", "service": "Foil work", "quantity": 100, "customer_id": cust["id"]}
        r = api("POST", "/outsource/", body, production)
        expect_status(r, 201)
        oid = r.data["id"]
        expect(api("GET", "/outsource/", token=production).status == 200, "list")
        u = api("PUT", f"/outsource/{oid}", {"status": "received"}, production)
        expect_status(u, 200)
        expect(u.data["status"] == "received" and u.data["received_date"], u.data)
        # money handling and deleting stay with the other roles
        cost = api("PUT", f"/outsource/{oid}", {"cost_amount": 500}, admin())
        expect_status(api("POST", f"/outsource/{oid}/payments", {"amount": 100, "method": "cash"}, production), 403)
        expect_status(api("POST", f"/outsource/{oid}/payments", {"amount": 100, "method": "cash"}, counter), 200)
        expect_status(api("DELETE", f"/outsource/{oid}", token=production), 403)
        expect_status(api("POST", "/outsource/", body, accounts), 201)
        api("DELETE", f"/outsource/{oid}", token=admin())
        return "The staff (production) login can list, send out and update outsourced work; paying the outside company and deleting stay closed to it"
    run("R11O", M_OS, "Outsource for the staff login", "Create / update allowed; payment and delete refused", t)

    # ================================================================== 6) + 7) bill book naming
    def t():
        q, inv, job = make([bill_book(300)], gst=True, jobs=True, priority="urgent")
        row = inv["items"][0]
        expect(row["description"].startswith("Bill Book - 1/4"), row["description"])
        expect("Sheet Printing" not in row["description"], row["description"])
        for url in (f"/invoices/{inv['id']}/bill-pdf?bill_type=gst", f"/invoices/{inv['id']}/pdf?format=a4", f"/invoices/{inv['id']}/pdf?format=thermal_80", f"/quotations/{q['id']}/pdf"):
            txt = pdf_text(get_pdf(url))
            expect("Bill Book" in txt and "Sheet Printing" not in txt, f"naming on {url}")
        got = api("GET", f"/invoices/{inv['id']}", token=counter).data["items"][0]
        expect(got["description"].startswith("Bill Book - 1/4"), "description on the invoice page")
        listed = next(i for i in api("GET", "/invoices/", token=counter).data if i["id"] == inv["id"])["items"][0]
        expect(listed["description"].startswith("Bill Book - 1/4"), "description in the invoice list")
        j = next(x for x in api("GET", "/job-cards/", token=counter).data if x["id"] == job["id"])
        expect(j["priority"] == "urgent", "the urgent order keeps its priority")
        sheet = api("GET", f"/job-cards/{job['id']}/sheet", token=counter).data["sheet"]
        expect(sheet["job_name"].endswith("Bill Book"), sheet["job_name"])
        return "An urgent bill book order reads 'Bill Book - 1/4 (...)' on the invoice page and list, the GST bill, A4 invoice, receipt and quotation (never 'Sheet Printing'), and the job card says Bill Book"
    run("R11B", M_BB, "Bill book (urgent) is named Bill Book on the invoice", "Bill Book everywhere, not Sheet Printing", t)

    def t():
        letter = bill_book(100, doc="Letter Pad")
        q, inv, job = make([letter], gst=False, jobs=False)
        expect(inv["items"][0]["description"].startswith("Letter Pad - 1/4"), inv["items"][0]["description"])
        return "The chosen document type (Letter Pad) is the name on the bill"
    run("R11B", M_BB, "The document type names the row", "Letter Pad - 1/4", t)

    # ================================================================== 8) job card list order
    def t():
        jobs = api("GET", "/job-cards/", token=counter).data
        ids = [j["id"] for j in jobs]
        expect(ids == sorted(ids, reverse=True), "the job cards come newest number first, not urgent first")
        return f"{len(ids)} job cards come in job-number order (urgent ones are not moved up)"
    run("R11J", M_JC, "Job cards come in number order", "Descending job numbers", t)

    # ================================================================== 9) every option on the paper job card
    def t():
        item = catalog.item("Visiting Card", "Visiting Card", 100, [("Finish/Lamination Type", "Matt Lamination"), ("Side", "Front & Back")], charges=("Foiling - Gold", "Designing Charge"), notes="Logo on the left")
        q, inv, job = make([item], jobs=True)
        sheet = api("GET", f"/job-cards/{job['id']}/sheet", token=counter).data["sheet"]
        expect("Finish/Lamination Type: Matt Lamination" in sheet["remarks"], sheet["remarks"])
        expect("Front & Back" in sheet["paper"][0]["printing"], sheet["paper"][0])
        expect("Logo on the left" in sheet["remarks"] and "Foiling: Gold" in sheet["remarks"] and "Design: Designing Charge" in sheet["remarks"], sheet["remarks"])
        expect(sheet["paper"][0]["qty"] == "100", sheet["paper"][0])
        for wp in ("false", "true"):
            txt = pdf_text(get_pdf(f"/job-cards/{job['id']}/sheet-pdf?with_price={wp}"))
            for need in ("Matt Lamination", "Front & Back", "Logo on the left", "Foiling: Gold"):
                expect(need in txt, f"'{need}' missing on the printed paper job card")
        # an option that has its own box is not repeated in the remarks
        expect("Side:" not in sheet["remarks"], sheet["remarks"])
        return "A visiting card ordered with finish, both sides, foiling, design charge and a note shows ALL of it on the paper job card (the finish was missing before)"
    run("R11J", M_JC, "Every option of the order shows on the paper job card", "Finish, sides, extras, notes on the card", t)

    def t():
        q, inv, job = make([bill_book(100)], jobs=True)
        sheet = api("GET", f"/job-cards/{job['id']}/sheet", token=counter).data["sheet"]
        expect("Document Type" not in sheet["remarks"] and "Paper Name" not in sheet["remarks"], sheet["remarks"])
        expect(len(sheet["paper"]) == 3 and sheet["paper"][0]["range"], sheet["paper"])
        return "Options that already have a box on the card (paper, GSM, copies, document type) are not repeated in the remarks"
    run("R11J", M_JC, "Options with their own box are not repeated", "No duplicates in the remarks", t)

    # ================================================================== 10) invoice bill format + HSN
    def t():
        q, inv, job = make([vc(100)], gst=True, jobs=False)
        pdfb = get_pdf(f"/invoices/{inv['id']}/pdf?format=a4")
        txt = pdf_text(pdfb)
        for need in ("INVOICE", "HSN", "CGST", "SGST", "Grand TOTAL", "Total Amount After Tax", "Rupees Inwords", "Party GSTIN"):
            expect(need in txt, f"'{need}' missing on the A4 invoice")
        expect(inv["items"][0]["hsn_code"] and inv["items"][0]["hsn_code"] in txt, "the HSN code is printed")
        expect(same_size(media_box(pdfb), A4), media_box(pdfb))
        qc, invc, _ = make([vc(100)], gst=False, jobs=False)
        ctxt = pdf_text(get_pdf(f"/invoices/{invc['id']}/pdf?format=a4"))
        expect("CASH BILL" in ctxt and "P A R T I C U L A R S" in ctxt, "a cash order prints the cash bill")
        same = pdf_text(get_pdf(f"/invoices/{inv['id']}/bill-pdf?bill_type=gst"))
        expect(("Grand TOTAL" in same) and inv["items"][0]["hsn_code"] in same, "the GST bill itself")
        return "The A4 invoice is Sri Jayam's own bill: the GST INVOICE with HSN / SAC, CGST, SGST and totals for a GST order, the CASH BILL otherwise"
    run("R11I", M_IN, "A4 invoice uses the shop's bill format and shows the HSN code", "GST invoice with HSN / cash bill", t)

    # ================================================================== help chat
    def t():
        cases = {
            "how do I add more than two proofs": ("Add another proof", "/dashboard"),
            "delivery date before proof date": ("last proof", "/dashboard"),
            "customer paid the overdue balance how to update": ("Record payment", "/dashboard"),
            "can staff login see outsource": ("Outsource", "/outsource"),
            "how to search a job card": ("search", "/job-cards"),
            "can I add another service in the same order": ("Add Line Item", "/dashboard"),
        }
        bad = []
        for q, (word, link) in cases.items():
            r = api("POST", "/assistant/ask", {"question": q}, counter)
            expect_status(r, 200)
            d = r.data
            if not (d["found"] and word.lower() in d["answer"].lower() and d["link"] == link):
                bad.append((q, d["found"], d["link"], d["answer"][:80]))
        expect(not bad, bad)
        return f"{len(cases)} questions reach the right answer and page"
    run("R11H", M_IN, "The help chat knows the round 11 features", "Right answer and link", t)
