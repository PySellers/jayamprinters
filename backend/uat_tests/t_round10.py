"""Round 9 follow-up (client + developer feedback): the Billing Person Name list (select, add a new person, remove a name that is
not needed), the job card edit for both copies (every role can edit and save), and the A5 size of the printed job cards."""

import uuid

from framework import admin, api, as_role, expect, expect_status, run
from t_round9 import media_box, pdf_text, same_size, A5_LAND, A4_LAND, get_pdf, order, vc, new_customer
import t_round9

TAG = uuid.uuid4().hex[:5]
M_BP = "Round 10 - Billing Person Name list"
M_JC = "Round 10 - Edit job card (both copies, all roles)"
M_A5 = "Round 10 - A5 job card size"


def run_all():
    t_round9.S["cust"] = new_customer("Main10")
    counter, production, accounts = as_role("counter"), as_role("production"), as_role("accounts")

    # ================================================================== billing person list
    def person(label, phone_digit, **kw):
        body = {"name": f"ZZTEST R10 {label} {TAG}", "billing_person_name": f"ZZTEST R10 {label} {TAG}", "phone": f"85{TAG_N}{phone_digit}", **kw}
        r = api("POST", "/customers/", body, counter)
        expect_status(r, 201)
        return r.data

    TAG_N = str(int(TAG, 16)).zfill(8)[:7]

    def listed():
        r = api("GET", "/customers/billing-persons", token=counter)
        expect_status(r, 200)
        return r.data

    def t():
        zed = person("Zed", 1)
        abe = person("Abe", 2)
        walk = api("POST", "/customers/", {"name": "Person 9999", "billing_person_name": "Person 9999", "phone": f"85{TAG_N}3"}, counter).data
        names = [c["billing_person_name"] or c["name"] for c in listed()]
        expect(zed["name"] in names and abe["name"] in names, "new people are in the list")
        expect(names.index(abe["name"]) < names.index(zed["name"]), "the list is A to Z")
        import re
        expect(all(not re.match(r"^\s*Person\s+\d+\s*$", n or "", re.I) for n in names), "walk-in placeholders ('Person 12') stay out of the list")
        expect(all(c["hidden_in_billing"] is False for c in listed()), "no hidden name in the list")
        t_round10_S["zed"], t_round10_S["abe"], t_round10_S["walk"] = zed, abe, walk
        return f"{len(names)} names, A to Z, without 'Person N' placeholders"
    t_round10_S = {}
    run("R10B", M_BP, "The Billing Person Name list: every saved name, A to Z", "Sorted list, no placeholders", t)

    def t():
        zed, abe = t_round10_S["zed"], t_round10_S["abe"]
        q, inv, job = order([vc(50)], customer=zed, jobs=False)
        r = api("PUT", f"/customers/{zed['id']}", {"hidden_in_billing": True}, counter)
        expect_status(r, 200)
        expect(r.data["hidden_in_billing"] is True, r.data)
        names = [c["id"] for c in listed()]
        expect(zed["id"] not in names and abe["id"] in names, "a removed name leaves the list, the others stay")
        defaults = api("GET", "/customers/billing-defaults", token=counter).data
        expect(zed["id"] not in [c["id"] for c in defaults["recent_customers"]], "also not in the recent names")
        # nothing else is touched: the customer, the order and the invoice are still there
        still = api("GET", f"/customers/{zed['id']}", token=counter)
        expect_status(still, 200)
        expect(still.data["name"] == zed["name"] and still.data["phone"] == zed["phone"], still.data)
        expect(api("GET", f"/invoices/{inv['id']}", token=counter).status == 200, "the invoice is kept")
        hist = api("GET", f"/customers/{zed['id']}/orders", token=counter).data
        expect(hist, "order history is kept")
        # still found by phone (the order form looks the number up)
        found = api("GET", f"/customers/search/{zed['phone']}", token=counter).data
        expect(any(c["id"] == zed["id"] for c in found), "a removed name is still found by its phone number")
        return "Removing a name hides it from the list only; the customer, order, invoice, history and phone lookup are untouched"
    run("R10B", M_BP, "Remove a name that is not needed", "Gone from the list; nothing else changes", t)

    def t():
        zed = t_round10_S["zed"]
        r = api("PUT", f"/customers/{zed['id']}", {"hidden_in_billing": False}, counter)
        expect_status(r, 200)
        expect(zed["id"] in [c["id"] for c in listed()], "a name put back is listed again")
        api("PUT", f"/customers/{zed['id']}", {"hidden_in_billing": True}, counter)
        again = api("PUT", f"/customers/{zed['id']}", {"billing_person_name": zed["billing_person_name"], "hidden_in_billing": False}, counter)
        expect(again.data["hidden_in_billing"] is False, "placing an order again brings the name back")
        return "A name can be shown in the list again (Customers page, or by ordering for the person again)"
    run("R10B", M_BP, "A removed name can come back", "Listed again", t)

    def t():
        new = api("POST", "/customers/", {"name": f"ZZTEST R10 New {TAG}", "billing_person_name": f"ZZTEST R10 New {TAG}", "phone": f"85{TAG_N}4"}, counter)
        expect_status(new, 201)
        expect(new.data["hidden_in_billing"] is False and new.data["id"] in [c["id"] for c in listed()], "a new person is in the list at once")
        dup = api("POST", "/customers/", {"name": "ZZTEST R10 Dup", "phone": f"85{TAG_N}4"}, counter)
        expect_status(dup, 400)
        expect("already exists" in str(dup.data), dup.data)
        none = api("POST", "/customers/", {"name": f"ZZTEST R10 NoPhone {TAG}", "billing_person_name": f"ZZTEST R10 NoPhone {TAG}"}, counter)
        expect_status(none, 201)
        expect(none.data["id"] in [c["id"] for c in listed()], "a person without a phone is allowed")
        expect_status(api("GET", "/customers/billing-persons"), 401)
        return "A new person (with or without a phone) is listed at once; the same phone twice is refused; sign-in is needed"
    run("R10B", M_BP, "Add a new person", "Listed at once; duplicate phone refused", t)

    def t():
        for tok, who in ((production, "production"), (accounts, "accounts"), (as_role("admin"), "admin")):
            expect_status(api("GET", "/customers/billing-persons", token=tok), 200)
        return "Every signed-in role can read the list"
    run("R10B", M_BP, "The list is available to every signed-in role", "200", t)

    # ================================================================== edit job card, both copies, all roles
    q, inv, job = order([vc(100)], customer=t_round9.S["cust"])
    jid = job["id"]

    def t():
        out = []
        for who, tok in (("admin", as_role("admin")), ("counter", counter), ("production", production), ("accounts", accounts)):
            sh = api("GET", f"/job-cards/{jid}/sheet", token=tok)
            expect_status(sh, 200)
            sheet = sh.data["sheet"]
            sheet["party_name"] = f"Edited by {who} {TAG}"
            lines = [dict(l) for l in sh.data["price_lines"]]
            lines[0]["label"] = f"Price by {who}"
            r = api("PUT", f"/job-cards/{jid}/sheet", {"sheet": {**sheet, "price_lines": lines}}, tok)
            expect_status(r, 200)
            expect(r.data["sheet"]["party_name"] == f"Edited by {who} {TAG}" and r.data["price_lines"][0]["label"] == f"Price by {who}", who)
            plain = pdf_text(get_pdf(f"/job-cards/{jid}/sheet-pdf?with_price=false", tok))
            priced = pdf_text(get_pdf(f"/job-cards/{jid}/sheet-pdf?with_price=true", tok))
            expect(f"Edited by {who} {TAG}" in plain and f"Edited by {who} {TAG}" in priced, f"{who}: the party name on both copies")
            expect(f"Price by {who}" in priced and f"Price by {who}" not in plain, f"{who}: the price only on the copy with price")
            out.append(who)
        return "Admin, counter, production and accounts can all edit and save the job card; both copies print the edit (the price only on the copy with price)"
    run("R10J", M_JC, "Every role can edit the job card, with and without price", "Saved and printed by each role", t)

    # ================================================================== A5
    def t():
        for wp in ("false", "true"):
            b = get_pdf(f"/job-cards/{jid}/sheet-pdf?with_price={wp}")
            expect(same_size(media_box(b), A5_LAND), media_box(b))
            txt = pdf_text(b)
            expect("A5 landscape (210 x 148 mm)" in txt, "the paper size is written on the card")
            expect(("with price" in txt.split("print at actual size")[-1]) == (wp == "true"), "the copy is named on the card")
            expect(b"/PrintScaling /None" in b, "print at actual size is requested")
            d = get_pdf(f"/job-cards/{jid}/pdf?with_price={wp}")
            expect(same_size(media_box(d), A5_LAND) and "A5 landscape - print at actual size" in pdf_text(d), "detailed card")
        b4 = get_pdf(f"/job-cards/{jid}/sheet-pdf?with_price=true&size=a4")
        expect(same_size(media_box(b4), A4_LAND) and "A4 landscape (297 x 210 mm)" in pdf_text(b4), "A4 on request")
        return "Both job cards are A5 landscape (210 x 148 mm), say so on the page and ask for actual-size printing; size=a4 still gives A4"
    run("R10A", M_A5, "The job card sheet is A5 (and says so)", "A5 page, size note, actual-size print", t)

    # ================================================================== help chat
    def t():
        cases = {
            "how do I add a new billing person name": ("Add a new person", "/dashboard"),
            "how to remove a billing person name from the list": ("cross beside a name", "/dashboard"),
            "is the job card sheet A5 size": ("A5", "/job-cards"),
            "edit job card without price": ("without price", "/job-cards"),
            "edit job card with price": ("with price", "/job-cards"),
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
    run("R10H", M_BP, "The help chat knows the billing person list and the two job card edits", "Right answer and link", t)
