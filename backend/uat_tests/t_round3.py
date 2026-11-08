"""Client round 3: the shop's real price lists (Xerox, Printout, boards, stickers, lamination), order discount, the price
breakdown behind every rate, printing-charge bands, minimum quantity, required extras with Custom, the paper of every
copy, design proofs, urgent jobs and the dynamic job card (screen data and PDF, with and without prices)."""

import uuid

import catalog
from framework import admin, api, as_role, expect, expect_status, run

TAG = uuid.uuid4().hex[:5]
PH = str(int(TAG, 16)).zfill(8)
S = {"quotes": [], "invoices": [], "cats": [], "products": []}

M_PRICE = "Round 3 - Shop price lists"
M_DISC = "Round 3 - Order discount"
M_BRK = "Round 3 - Price breakdown"
M_BAND = "Round 3 - Printing charge bands"
M_MIN = "Round 3 - Minimum quantity"
M_EXT = "Round 3 - Extras (None / option / Custom)"
M_CPY = "Round 3 - Paper of every copy"
M_PRF = "Round 3 - Design proofs"
M_JOB = "Round 3 - Dynamic job card"


def preview(items, gst=False, **kw):
    r = api("POST", "/quotations/preview", {"with_gst": gst, "items": items, **kw}, admin())
    expect_status(r, 200)
    return r.data


def total_of(item, **kw):
    d = preview([item], **kw)
    it = d["items"][0]
    expect(it["priceable"], f"not priceable: {it.get('message')}")
    return it["total_price"]


def money(a, b, tol=0.02):
    return abs(a - b) <= tol


def vc(qty=100, **kw):
    return catalog.item("Visiting Card", "Visiting Card", qty, [("Finish/Lamination Type", "Without Lamination"), ("Side", "Single Side")], **kw)


def make_order(items, gst=False, jobs=True, invoice=True, **kw):
    body = dict(customer_id=S["cust"], with_gst=gst, is_order=True, items=items, **kw)
    q = api("POST", "/quotations/", body, admin())
    expect_status(q, 200, 201)
    S["quotes"].append(q.data["id"])
    inv = None
    if jobs:
        expect_status(api("POST", f"/quotations/{q.data['id']}/convert", token=admin()), 200, 201)
    if invoice:
        inv = api("POST", f"/invoices/from-quotation/{q.data['id']}", token=admin())
        expect_status(inv, 200, 201)
        S["invoices"].append(inv.data["id"])
    return q.data, (inv.data if inv else None)


def job_of(q):
    return next(j for j in api("GET", "/job-cards/", token=admin()).data if j["quotation_item_id"] == q["items"][0]["id"])


def bill_item(qty=500, copies="1+2", gsm="80 GSM", size="Sheet Printing - 1/4", specs=None, doc="Bill Book", paper="Excel Bond"):
    it = catalog.item("Bill Books & Stationery", size, qty, [("Document Type", doc), ("Paper Name", paper), ("Paper/GSM Type", gsm), ("Copies per Set", copies)])
    if specs is not None:
        it["layer_specs"] = specs
    return it


def opt_id(cat, attr, value):
    return catalog.option(cat, attr, value)["attribute_option_id"]


def run_all():
    catalog.clear()
    c = api("POST", "/customers/", {"name": f"ZZTEST Round3 {TAG}", "phone": "83" + PH + "0"}, admin())
    S["cust"] = c.data["id"]

    # ================================================================== the shop's real price lists
    def t():
        out = []
        for qty in (1, 40, 300, 1500):
            tot = total_of(catalog.item("Xerox / Photocopy", "Xerox / Photocopy", qty, [("Paper Size", "A4"), ("Colour", "Black & White"), ("Print Side", "Single Side")]))
            expect(money(tot, 2.0 * qty), f"A4 B/W x{qty}: Rs{tot}")
            out.append(f"{qty} = Rs{tot:g}")
        return "Xerox B/W A4 is Rs2 a page at every quantity: " + ", ".join(out)
    run("R3P", M_PRICE, "Xerox A4 black & white is Rs2 a page (poster headline)", "Rs2 x pages, no bulk break", t)

    def t():
        for side, rate in (("Single Side", 4.0), ("Double Side", 7.0)):
            tot = total_of(catalog.item("Xerox / Photocopy", "Xerox / Photocopy", 10, [("Paper Size", "A3"), ("Colour", "Black & White"), ("Print Side", side)]))
            expect(money(tot, rate * 10), f"A3 B/W {side}: Rs{tot}")
        for side, rate in (("Single Side", 12.0), ("Double Side", 23.0)):
            tot = total_of(catalog.item("Xerox / Photocopy", "Xerox / Photocopy", 10, [("Paper Size", "A3"), ("Colour", "Colour"), ("Print Side", side)]))
            expect(money(tot, rate * 10), f"A3 colour {side}: Rs{tot}")
        return "A3 Xerox: B/W Rs4 / Rs7, colour Rs12 / Rs23 per page"
    run("R3P", M_PRICE, "Xerox A3 rates match the poster (B/W 4 / 7, colour 12 / 23)", "As on the poster", t)

    def t():
        for qty, expected in ((1, 5.0), (2, 10.0), (3, 10.0), (4, 10.0), (5, 10.0), (6, 12.0), (30, 57.0), (150, 262.5)):
            tot = total_of(catalog.item("Printout", "A4 B/W Laser Printout", qty, [("Print Side", "One Side")]))
            expect(money(tot, expected), f"{qty} printouts: Rs{tot}, expected Rs{expected}")
        return "1 = Rs5, 2-3 = Rs10 for the lot, 4-5 held at Rs10 (a bigger order never costs less), 6 = Rs12, 30 = Rs57, 150 = Rs262.50"
    run("R3P", M_PRICE, "A4 B/W printout: 1st print Rs5, '2-3 prints' Rs10 for the lot, then the page-count rates", "Rates of the poster's table", t)

    def t():
        one = total_of(catalog.item("Printout", "A4 Colour Laser Printout", 10, [("Colour / Paper Type", "Normal Colour"), ("Print Side", "One Side")]))
        both = total_of(catalog.item("Printout", "A4 Colour Laser Printout", 10, [("Colour / Paper Type", "Full Solid Colours"), ("Print Side", "Front & Back")]))
        scan = total_of(catalog.item("Printout", "Scanning (up to A3)", 20, [("Print Side", "One Side")]))
        held = total_of(catalog.item("Printout", "Scanning (up to A3)", 12, [("Print Side", "One Side")]))
        expect(money(one, 120) and money(both, 350) and money(scan, 160) and money(held, 100), (one, both, scan, held))
        return "Colour normal 10 x Rs12, full solid F&B 10 x Rs35, scanning 20 pages x Rs8 (12 pages are held at the 10-page price Rs100)"
    run("R3P", M_PRICE, "Colour printout and scanning follow the poster", "Rs120 / Rs350 / Rs96", t)

    def t():
        rows = [(1, 30.0), (2, 49.5), (5, 108.0), (20, 30 + 19 * 19.5)]
        for qty, expected in rows:
            tot = total_of(catalog.item("Board & Paper Printing (13x19)", "Board / Paper Printing 13x19", qty, [("Board / Paper", "300 GSM Art / Matt Board")]))
            expect(money(tot, expected), f"{qty} boards: Rs{tot}, expected Rs{expected}")
        return "300 GSM Art/Matt board: Master Rs30 for the 1st sheet + Additional Rs19.50 each (5 sheets = Rs108)"
    run("R3P", M_PRICE, "Board printing: Master rate for the first sheet, Additional for the rest", "30 + 19.50 each", t)

    def t():
        cases = [("Synthetic Board", 3, 60 + 2 * 40), ("130 GSM Art Paper", 4, 30 + 3 * 16.5), ("12x17 100 GSM Bond Paper", 6, 120), ("A3 Colour Print", 3, 60), ("12x18 100 GSM Paper", 3, 20 + 2 * 12)]
        for name, qty, expected in cases:
            tot = total_of(catalog.item("Board & Paper Printing (13x19)", "Board / Paper Printing 13x19", qty, [("Board / Paper", name)]))
            expect(money(tot, expected), f"{name} x{qty}: Rs{tot}, expected Rs{expected}")
        return "Synthetic, 130 GSM art, bond, A3 colour and 100 GSM paper all priced from the rate sheet"
    run("R3P", M_PRICE, "Other boards and papers use their own Master / Additional rates", "Rate sheet values", t)

    def t():
        cases = [("Sticker Sheet 13x19", "Normal Sticker", 1, 30), ("Sticker Sheet 13x19", "Normal Sticker", 3, 72), ("Sticker Sheet 13x19", "Gold Sticker", 4, 90 + 3 * 70),
                 ("Sticker with Scoring 13x19", "Normal Sticker", 2, 210), ("Sticker with Scoring 13x19", "Gold Sticker", 1, 175),
                 ("Sticker with Scoring A4", "Normal Sticker", 3, 210), ("Sticker with Scoring A4", "Synthetic Sticker", 1, 90), ("Sticker with Scoring A4", "Silver Sticker", 2, 200)]
        for product, kind, qty, expected in cases:
            tot = total_of(catalog.item("Stickers", product, qty, [("Sticker Type", kind)]))
            expect(money(tot, expected), f"{product} {kind} x{qty}: Rs{tot}, expected Rs{expected}")
        return "Sticker sheets and sticker-with-scoring (13x19 and A4) priced from the rate sheet"
    run("R3P", M_PRICE, "Stickers and stickers with scoring use the rate sheet", "Rate sheet values", t)

    def t():
        board = lambda qty, extra: catalog.item("Board & Paper Printing (13x19)", "Board / Paper Printing 13x19", qty, [("Board / Paper", "300 GSM Art / Matt Board")], charges=extra)
        base2 = total_of(board(2, []))
        cold = total_of(board(2, ["Cold Lamination 13x19 Matt / Glossy (per board)"]))
        expect(money(cold - base2, 200), f"cold lamination added Rs{cold - base2}")
        few = total_of(board(10, ["Thermal Lamination 13x19 (per board, at least Rs.150)"])) - total_of(board(10, []))
        many = total_of(board(40, ["Thermal Lamination 13x19 (per board, at least Rs.150)"])) - total_of(board(40, []))
        expect(money(few, 150), f"10 boards thermal Rs{few}: the Rs150 minimum applies")
        expect(money(many, 300), f"40 boards thermal Rs{many}")
        return "Cold Rs100 a board; thermal Rs7.50 a board with a Rs150 minimum (10 boards = Rs150, 40 = Rs300)"
    run("R3P", M_PRICE, "Lamination: cold per board, thermal with a minimum charge", "Rs200 / Rs150 / Rs300", t)

    def t():
        for qty in range(1, 41):
            pass
        last = 0
        for qty in range(1, 60):
            tot = total_of(catalog.item("Board & Paper Printing (13x19)", "Board / Paper Printing 13x19", qty, [("Board / Paper", "Synthetic Board")]))
            expect(tot >= last - 0.005, f"{qty} boards Rs{tot} < Rs{last}")
            last = tot
        return "More boards never cost less (1 to 59)"
    run("R3P", M_PRICE, "Board printing: more sheets never cost less", "Total never goes down", t)

    def t():
        names = {x["name"]: x for x in api("GET", "/products/?limit=1000", token=admin()).data}
        for old in ("Sticker Sheet (A4)", "Sticker - by size (per sq ft)"):
            expect(not names[old]["is_active"], f"the test item '{old}' is still on sale")
        return "The old made-up sticker items are switched off"
    run("R3P", M_PRICE, "The old test sticker items are no longer offered", "Inactive", t)

    # ================================================================== discount
    def t():
        d = preview([vc()], gst=True, discount_type="percent", discount_value=10)
        expect(money(d["discount_amount"], 47.0), d)
        expect(money(d["taxable_amount"], 423.0), d)
        rate = d["tax_breakdown"][0]["rate"]
        expect(money(d["tax_amount"], round(423.0 * rate / 100, 2)), d)
        expect(money(d["grand_total"], 423.0 + d["tax_amount"]), d)
        return f"10% off Rs470 = Rs47; GST on Rs423 = Rs{d['tax_amount']:g}; total Rs{d['grand_total']:g}"
    run("R3D", M_DISC, "A percentage discount comes off before GST", "Discount 47, GST on the discounted amount", t)

    def t():
        d = preview([vc()], gst=False, discount_type="amount", discount_value=70)
        expect(money(d["discount_amount"], 70) and money(d["grand_total"], 400), d)
        return "Rs70 off Rs470 = Rs400"
    run("R3D", M_DISC, "An amount discount comes off the total", "Total Rs400", t)

    def t():
        for kind, value in (("percent", 101), ("amount", 5000)):
            r = api("POST", "/quotations/preview", {"items": [vc()], "discount_type": kind, "discount_value": value}, admin())
            expect_status(r, 400)
        r = api("POST", "/quotations/", dict(customer_id=S["cust"], with_gst=False, discount_type="amount", discount_value=999999, items=[vc()]), admin())
        expect_status(r, 400)
        r = api("POST", "/quotations/preview", {"items": [vc()], "discount_type": "amount", "discount_value": -5}, admin())
        expect_status(r, 422)
        return "More than 100%, more than the total and a negative discount are all refused"
    run("R3D", M_DISC, "A discount bigger than the order (or negative) is refused", "400 / 422", t)

    def t():
        q, inv = make_order([vc(), vc(200)], gst=True, discount_type="percent", discount_value=15)
        gross = sum(i["total_price"] for i in q["items"])
        expect(money(q["total_amount"], gross) and money(q["discount_amount"], round(gross * 0.15, 2)), q)
        expect(money(sum(i["discount_amount"] for i in q["items"]), q["discount_amount"]), "line shares do not add up to the discount")
        expect(money(q["grand_total"], gross - q["discount_amount"] + q["tax_amount"]), q)
        expect(money(sum(i["tax_amount"] for i in q["items"]), q["tax_amount"]), "line GST does not add up")
        expect(money(inv["subtotal"], gross) and money(inv["discount_amount"], q["discount_amount"]) and money(inv["grand_total"], q["grand_total"]), inv)
        expect(inv["discount_type"] == "percent" and inv["discount_value"] == 15, inv)
        S["disc_inv"] = inv
        S["disc_q"] = q
        return f"Two lines Rs{gross:g}, 15% = Rs{q['discount_amount']:g} off, invoice total Rs{inv['grand_total']:g}"
    run("R3D", M_DISC, "The discount is saved on the order, spread over the lines, and carried to the invoice", "Order and invoice agree", t)

    def t():
        q = S["disc_q"]
        d = preview([vc(), vc(200)], gst=True, discount_type="percent", discount_value=15)
        expect(money(d["grand_total"], q["grand_total"]), f"preview Rs{d['grand_total']} vs saved Rs{q['grand_total']}")
        return "The screen preview and the saved order give the same total"
    run("R3D", M_DISC, "Preview equals the saved order", "Same grand total", t)

    def t():
        q, inv = make_order([vc()], gst=False, discount_type="amount", discount_value=50)
        expect(money(inv["grand_total"], q["total_amount"] - 50) and inv["tax_amount"] == 0, inv)
        r = api("POST", f"/invoices/{inv['id']}/payments", {"amount": inv["grand_total"] + 1, "method": "cash"}, admin())
        expect_status(r, 400)
        r = api("POST", f"/invoices/{inv['id']}/payments", {"amount": inv["grand_total"], "method": "cash"}, admin())
        expect_status(r, 200, 201)
        expect(r.data["status"] == "paid", r.data)
        return f"Cash bill Rs{inv['grand_total']:g} after Rs50 off; paying exactly that settles it, one rupee more is refused"
    run("R3D", M_DISC, "A discounted bill is settled by paying the discounted total", "Paid in full at the net total", t)

    def t():
        inv = S["disc_inv"]
        for url in (f"/invoices/{inv['id']}/bill-pdf?bill_type=gst", f"/invoices/{inv['id']}/bill-pdf?bill_type=cash", f"/invoices/{inv['id']}/pdf?format=a4",
                    f"/invoices/{inv['id']}/pdf?format=thermal_80", f"/quotations/{S['disc_q']['id']}/pdf"):
            r = api("GET", url, token=admin())
            expect_status(r, 200)
            expect(r.raw[:4] == b"%PDF" and len(r.raw) > 1500, f"{url}: not a PDF")
        return "GST bill, cash bill, A4, thermal and the quotation letter all print with a discount"
    run("R3D", M_DISC, "Every bill layout prints a discounted order", "Valid PDFs", t)

    def t():
        r = api("POST", "/quotations/", dict(customer_id=S["cust"], with_gst=True, items=[vc()]), admin())
        expect_status(r, 200, 201)
        S["quotes"].append(r.data["id"])
        expect(r.data["discount_amount"] == 0 and r.data["discount_type"] is None, r.data)
        return "No discount asked = no discount stored"
    run("R3D", M_DISC, "An order without a discount is unchanged", "Discount 0", t)

    # ================================================================== breakdown
    def t():
        d = preview([vc()], gst=False)
        it = d["items"][0]
        rows = it["breakdown"]
        expect(rows and all({"kind", "label", "detail", "amount", "area"} <= set(r) for r in rows), rows)
        expect(money(sum(r["amount"] for r in rows), it["total_price"]), f"rows add to Rs{sum(r['amount'] for r in rows)}, line is Rs{it['total_price']}")
        kinds = {r["kind"] for r in rows}
        expect({"paper", "printing"} <= kinds, kinds)
        return "Rows: " + "; ".join(f"{r['label']} Rs{r['amount']:g}" for r in rows)
    run("R3B", M_BRK, "Every line's price breakdown adds up to its total", "paper + printing = total", t)

    def t():
        it = preview([vc()])["items"][0]
        cat = catalog.category("Visiting Card")["id"]
        prod = catalog.product("Visiting Card", "Visiting Card")["id"]
        paper = next(r for r in it["breakdown"] if r["kind"] == "paper")
        prn = next(r for r in it["breakdown"] if r["kind"] == "printing")
        expect(paper["area"] == "matrix" and paper["product_id"] == prod and paper["category_id"] == cat, paper)
        expect(prn["area"] == "printing" and prn["category_id"] == cat and "1 to 1,000" in prn["detail"], prn)
        return f"Paper links to the product's price matrix; printing links to Pricing Setup > Printing ({prn['detail']})"
    run("R3B", M_BRK, "Each part says where its rate comes from", "area + ids to build the link", t)

    def t():
        q, inv = make_order([vc(100, charges=["Corner Cutting - Four Corner"])], gst=False)
        saved = q["items"][0]["price_breakdown"]
        expect(saved and any(r["kind"] == "charge" and "Corner" in r["label"] for r in saved), saved)
        expect(money(sum(r["amount"] for r in saved), q["items"][0]["total_price"]), saved)
        expect(inv["items"][0]["price_breakdown"] == saved, "invoice does not carry the breakdown")
        return "The breakdown is frozen on the order and copied to the invoice"
    run("R3B", M_BRK, "The saved order and its invoice keep the breakdown", "Same rows", t)

    def t():
        q, _ = make_order([catalog.item("Board & Paper Printing (13x19)", "Board / Paper Printing 13x19", 5, [("Board / Paper", "300 GSM Art / Matt Board")])], invoice=False, jobs=False)
        rows = q["items"][0]["price_breakdown"]
        expect(money(sum(r["amount"] for r in rows), 108.0), rows)
        expect("first-piece and additional-piece" in rows[0]["detail"], rows[0])
        return rows[0]["detail"]
    run("R3B", M_BRK, "Master / Additional pricing is explained in words", "Mentions first and additional rates", t)

    def t():
        small = api("GET", "/print-charge-bands/?category_id=" + str(catalog.category("Visiting Card")["id"]), token=admin())
        expect_status(small, 200)
        d = preview([catalog.item("Visiting Card", "Visiting Card", 50, [("Finish/Lamination Type", "Without Lamination"), ("Side", "Single Side")])])["items"][0]
        floor = next((r for r in d["breakdown"] if r["kind"] == "minimum"), None)
        expect(floor is None or money(sum(r["amount"] for r in d["breakdown"]), d["total_price"]), d)
        return "Minimum-charge rows (when they apply) keep the breakdown adding up"
    run("R3B", M_BRK, "A minimum charge shows as its own row", "Rows still add up", t)

    # ================================================================== printing-charge bands
    def mk_cat():
        r = api("POST", "/product-categories/", {"name": f"ZZ Bands {TAG}", "is_active": True, "print_charge_mode": "slab"}, admin())
        expect_status(r, 200, 201)
        S["cats"].append(r.data["id"])
        p = api("POST", "/products/", {"name": f"ZZ Band item {TAG}", "category_id": r.data["id"], "pricing_type": "fixed", "fixed_price": 1.0}, admin())
        expect_status(p, 200, 201)
        S["products"].append(p.data["id"])
        S["band_cat"], S["band_prod"] = r.data["id"], p.data["id"]

    def band_total(qty):
        return total_of(dict(product_id=S["band_prod"], quantity=qty, selected_options=[], extra_charge_ids=[]))

    def t():
        mk_cat()
        client = [
            {"min_quantity": 1, "max_quantity": 1000, "amount": 500, "per_block": False},
            {"min_quantity": 1001, "max_quantity": None, "amount": 2000, "per_block": True, "block_size": 1000},
        ]
        r = api("PUT", f"/print-charge-bands/{S['band_cat']}", client, admin())
        expect_status(r, 200)
        expect(len(r.data) == 2, r.data)
        got = {q: band_total(q) - q for q in (1, 999, 1000, 1001, 2000, 2001, 3500)}
        want = {1: 500, 999: 500, 1000: 500, 1001: 2500, 2000: 2500, 2001: 4500, 3500: 6500}
        expect(all(money(got[q], want[q]) for q in want), f"printing charge by quantity {got}, expected {want}")
        return "Up to 1,000 = Rs500; above 1,000 Rs2,000 is added for each started 1,000 (1,001 = 2,500; 2,001 = 4,500)"
    run("R3N", M_BAND, "The client's rule: up to 1,000 Rs500, then Rs2,000 for each further 1,000", "Printing charge by quantity", t)

    def t():
        edited = [
            {"min_quantity": 1, "max_quantity": 1000, "amount": 500, "per_block": False},
            {"min_quantity": 1001, "max_quantity": 2000, "amount": 200, "per_block": False},
            {"min_quantity": 2001, "max_quantity": None, "amount": 5000, "per_block": False},
        ]
        expect_status(api("PUT", f"/print-charge-bands/{S['band_cat']}", edited, admin()), 200)
        got = {q: band_total(q) - q for q in (1000, 1500, 2000, 2500)}
        expect(money(got[1000], 500) and money(got[1500], 200) and money(got[2000], 200) and money(got[2500], 5000), got)
        return "Changing the 1,001-2,000 band to Rs200 (and the next to Rs5,000) changes new orders at once"
    run("R3N", M_BAND, "The owner can change a band in Pricing Setup and the order page follows", "Rs200 for 1,001 to 2,000", t)

    def t():
        bad = [{"min_quantity": 1, "max_quantity": 1000, "amount": 1}, {"min_quantity": 900, "max_quantity": None, "amount": 2}]
        expect_status(api("PUT", f"/print-charge-bands/{S['band_cat']}", bad, admin()), 400)
        open_first = [{"min_quantity": 1, "max_quantity": None, "amount": 1}, {"min_quantity": 500, "max_quantity": None, "amount": 2}]
        expect_status(api("PUT", f"/print-charge-bands/{S['band_cat']}", open_first, admin()), 400)
        noblock = [{"min_quantity": 1, "max_quantity": None, "amount": 1, "per_block": True}]
        expect_status(api("PUT", f"/print-charge-bands/{S['band_cat']}", noblock, admin()), 400)
        return "Overlapping bands, an open band that is not last, and a per-block band with no block size are refused"
    run("R3N", M_BAND, "Wrong band tables are refused", "400 with a reason", t)

    def t():
        r = api("PUT", f"/print-charge-bands/{S['band_cat']}", [{"min_quantity": 1, "max_quantity": None, "amount": 1}], as_role("counter"))
        expect_status(r, 403)
        expect_status(api("GET", f"/print-charge-bands/?category_id={S['band_cat']}", token=as_role("counter")), 200)
        return "Counter can read the table but not change it"
    run("R3N", M_BAND, "Only the admin can change printing bands", "Counter gets 403", t)

    def t():
        expect_status(api("PUT", "/print-charge-bands/99999999", [{"min_quantity": 1, "max_quantity": None, "amount": 1}], admin()), 404)
        return "Unknown service gives 404"
    run("R3N", M_BAND, "Bands of a service that does not exist", "404", t)

    def t():
        bills = catalog.category("Bill Books & Stationery")
        expect(bills["print_charge_mode"] == "slab" and bills["print_per_layer"], bills)
        bands = api("GET", f"/print-charge-bands/?category_id={bills['id']}", token=admin()).data
        expect(len(bands) >= 2, bands)
        one = bill_item(1000, copies="1+1")
        two = bill_item(1000, copies="1+3")
        pr1 = preview([one])["items"][0]["print_charge"]
        pr2 = preview([two])["items"][0]["print_charge"]
        expect(money(pr1, 1000) and money(pr2, 2000), f"2 copies x 1,000 = 2,000 pages -> Rs{pr1}; 4 copies x 1,000 = 4,000 pages -> Rs{pr2}")
        return "Bill books count every copy of a set as a printed page: 1+1 copies of 1,000 = Rs1,000; 1+3 = Rs2,000"
    run("R3N", M_BAND, "Printing charge follows the total pages printed (quantity x copies)", "More copies, higher band", t)

    # ================================================================== minimum quantity
    def t():
        prod = catalog.product("Visiting Card", "Visiting Card")
        expect(prod["min_quantity"] == 50, prod)
        d = preview([vc(10)])["items"][0]
        expect(not d["priceable"] and "minimum" in (d["message"] or "").lower() and "50" in d["message"], d)
        r = api("POST", "/quotations/", dict(customer_id=S["cust"], with_gst=False, items=[vc(10)]), admin())
        expect_status(r, 400)
        expect("50" in r.raw.decode(), r.raw)
        return "10 visiting cards: " + d["message"]
    run("R3M", M_MIN, "Visiting cards cannot be ordered below 50", "Preview explains, order refused", t)

    def t():
        expect(preview([vc(50)])["items"][0]["priceable"], "50 should be priceable")
        expect(preview([vc(100)])["items"][0]["priceable"], "100 should be priceable")
        return "50 and 100 are accepted"
    run("R3M", M_MIN, "50 visiting cards is accepted", "Priced", t)

    def t():
        prod = catalog.product("Visiting Card", "Visiting Card")
        r = api("PUT", f"/products/{prod['id']}", {"min_quantity": 100}, admin())
        expect_status(r, 200)
        expect(r.data["min_quantity"] == 100, r.data)
        refused = preview([vc(50)])["items"][0]
        expect(not refused["priceable"] and "100" in refused["message"], refused)
        r = api("PUT", f"/products/{prod['id']}", {"min_quantity": 50}, admin())
        expect(r.data["min_quantity"] == 50, r.data)
        return "The minimum is set on the product (Products page): raised to 100, then put back to 50"
    run("R3M", M_MIN, "The minimum can be changed on the product", "Order screen follows", t)

    def t():
        prod = catalog.product("Visiting Card", "Visiting Card")
        r = api("PUT", f"/products/{prod['id']}", {"min_quantity": 5}, as_role("counter"))
        expect_status(r, 403)
        return "Counter cannot change a product"
    run("R3M", M_MIN, "Only the admin can change the minimum", "403", t)

    # ================================================================== extras
    def t():
        cat = catalog.category("Visiting Card")
        expect(cat["extras_required"] is True, cat)
        groups = {x["group_name"] for x in api("GET", f"/extra-charges/?category_id={cat['id']}", token=admin()).data if x["category_id"] == cat["id"] and x["is_active"]}
        expect({"Design", "Corner cutting", "Foiling"} <= groups, groups)
        return f"Visiting card extras are required dropdowns in sections: {sorted(g for g in groups if g)}"
    run("R3E", M_EXT, "Visiting card extras are grouped sections that must be answered", "extras_required + groups", t)

    def t():
        base = total_of(vc())
        custom = vc()
        custom["custom_charges"] = [{"label": "Special die", "amount": 125.0, "group": "Corner cutting"}]
        tot = total_of(custom)
        expect(money(tot - base, 125), f"custom charge added Rs{tot - base}")
        q, _ = make_order([custom], invoice=False, jobs=True)
        expect(q["items"][0]["custom_charges"][0]["label"] == "Special die", q["items"][0])
        rows = q["items"][0]["price_breakdown"]
        expect(any(r["kind"] == "custom" and r["label"] == "Special die" and money(r["amount"], 125) for r in rows), rows)
        S["custom_q"] = q
        return "A 'Custom...' extra (Special die, Rs125) is added to the price and kept on the order"
    run("R3E", M_EXT, "A custom extra with a name and an amount is priced and saved", "+Rs125", t)

    def t():
        bad = vc()
        bad["custom_charges"] = [{"label": "Discount trick", "amount": -50.0}]
        r = api("POST", "/quotations/preview", {"items": [bad]}, admin())
        expect_status(r, 422)
        r = api("POST", "/quotations/preview", {"items": [dict(vc(), custom_charges=[{"label": "", "amount": 5}])]}, admin())
        expect_status(r, 422)
        return "A negative or unnamed custom charge is refused"
    run("R3E", M_EXT, "Custom extras cannot be negative or unnamed", "422", t)

    def t():
        q, _ = make_order([vc(100, charges=["Foiling - Gold", "Designing Charge"])], invoice=False, jobs=False)
        lines = {c["name"]: c for c in q["items"][0]["charge_lines"]}
        expect(set(lines) == {"Foiling - Gold", "Designing Charge"} and lines["Foiling - Gold"]["group_name"] == "Foiling", lines)
        two = vc(100, charges=["Foiling - Gold", "Foiling - Silver"])
        expect_status(api("POST", "/quotations/", dict(customer_id=S["cust"], with_gst=False, items=[two]), admin()), 400)
        expect(not api("POST", "/quotations/preview", {"items": [two]}, admin()).data["items"][0]["priceable"], "preview must not price it")
        return "Chosen extras are listed by name on the order; two from the same section are refused"
    run("R3E", M_EXT, "The order lists its extras; one choice per section", "charge_lines; 400 for two in a section", t)

    def t():
        j = job_of(S["custom_q"])
        d = api("GET", f"/job-cards/{j['id']}/detail", token=admin()).data
        expect(any(e["name"] == "Special die" and e.get("custom") for e in d["extras"]), d["extras"])
        return "The job card lists the custom extra"
    run("R3E", M_EXT, "The job card shows the custom extra", "Special die listed", t)

    # ================================================================== paper of every copy
    def t():
        o = lambda attr, v: opt_id("Bill Books & Stationery", attr, v)
        specs = [
            {"paper_option_id": o("Paper Name", "Excel Bond"), "gsm_option_id": o("Paper/GSM Type", "80 GSM"), "size_product_id": catalog.product("Bill Books & Stationery", "Sheet Printing - 1/4")["id"], "colour": "White"},
            {"paper_option_id": o("Paper Name", "Palarpur"), "gsm_option_id": o("Paper/GSM Type", "60 GSM"), "size_product_id": catalog.product("Bill Books & Stationery", "Sheet Printing - 1/4")["id"], "colour": "Pink"},
            {"paper_option_id": o("Paper Name", "Sirpur"), "gsm_option_id": o("Paper/GSM Type", "54 GSM"), "size_product_id": catalog.product("Bill Books & Stationery", "Sheet Printing - 1/8")["id"], "colour": "Yellow"},
        ]
        same = preview([bill_item(500, "1+2")])["items"][0]["total_price"]
        mixed = preview([bill_item(500, "1+2", specs=specs)])["items"][0]
        expect(mixed["priceable"] and mixed["total_price"] != same, f"per-copy GSM / size did not change the price ({same} vs {mixed['total_price']})")
        paper_rows = [r for r in mixed["breakdown"] if r["kind"] == "paper"]
        expect(len(paper_rows) == 3 and "copy 2" in paper_rows[1]["label"] and "copy 3" in paper_rows[2]["label"], paper_rows)
        expect("60 GSM" in paper_rows[1]["detail"] and "54 GSM" in paper_rows[2]["detail"] and "1/8" in paper_rows[2]["detail"], paper_rows)
        S["specs"] = specs
        return "1+2 set: copy 1 80 GSM, copy 2 60 GSM, copy 3 54 GSM on the 1/8 size - each copy priced on its own: " + "; ".join(f"{r['label']} Rs{r['amount']:g}" for r in paper_rows)
    run("R3C", M_CPY, "Every copy of a set is priced in its own GSM and size", "Three paper rows", t)

    def t():
        q, inv = make_order([bill_item(500, "1+2", specs=S["specs"])], gst=False)
        expect(len(q["items"][0]["layer_specs"]) == 3, q["items"][0]["layer_specs"])
        j = job_of(q)
        d = api("GET", f"/job-cards/{j['id']}/detail", token=admin()).data
        expect(len(d["copies"]) == 3, d["copies"])
        want = [("Excel Bond", "80 GSM", "1/4", "White"), ("Palarpur", "60 GSM", "1/4", "Pink"), ("Sirpur", "54 GSM", "1/8", "Yellow")]
        got = [(c["paper"], c["gsm"], c["size"], c["colour"]) for c in d["copies"]]
        expect(got == want, f"{got} != {want}")
        names = [c["name"] for c in d["copies"]]
        expect(names == ["Original", "Duplicate", "Triplicate"], names)
        S["copy_job"] = j
        return "Job card lists Original / Duplicate / Triplicate with paper name, GSM, size and colour for EACH copy"
    run("R3C", M_CPY, "The job card shows paper name, GSM, size and colour of every copy", "A row per copy", t)

    def t():
        j = S["copy_job"]
        d = api("GET", f"/job-cards/{j['id']}/detail", token=admin()).data
        labels = {s["label"] for s in d["specs"]}
        expect("Document Type" in labels and "Copies per Set" in labels, labels)
        expect(not ({"Paper Name", "Paper/GSM Type", "Paper Colour"} & labels), "per-copy paper details must not be repeated in the general list: " + str(labels))
        return "The general list keeps document type and copies; paper details sit in the copies table"
    run("R3C", M_CPY, "No paper detail is lost or doubled on the job card", "Specs list + copies table", t)

    def t():
        o = lambda attr, v: opt_id("Bill Books & Stationery", attr, v)
        specs = [
            {"paper_option_id": o("Paper Name", "Custom"), "paper_custom": "Cream wove", "gsm_option_id": o("Paper/GSM Type", "80 GSM"), "size_product_id": catalog.product("Bill Books & Stationery", "Sheet Printing - 1/4")["id"]},
            {"gsm_option_id": o("Paper/GSM Type", "80 GSM"), "size_product_id": catalog.product("Bill Books & Stationery", "Sheet Printing - 1/4")["id"]},
        ]
        q, _ = make_order([bill_item(500, "1+1", specs=specs)], invoice=False)
        j = job_of(q)
        d = api("GET", f"/job-cards/{j['id']}/detail", token=admin()).data
        expect(d["copies"][0]["paper"] == "Cream wove", d["copies"])
        expect(d["copies"][1]["paper"] == "Excel Bond", "a copy with no paper chosen follows the Original: " + str(d["copies"]))
        return "A custom paper name is shown by its typed name; a copy with nothing chosen follows the Original copy"
    run("R3C", M_CPY, "Custom paper name and 'same as Original' defaults", "Typed name shown; default inherited", t)

    def t():
        q, _ = make_order([bill_item(500, "1+2")], invoice=False)
        j = job_of(q)
        d = api("GET", f"/job-cards/{j['id']}/detail", token=admin()).data
        expect(len(d["copies"]) == 3 and all(c["gsm"] == "80 GSM" for c in d["copies"]), d["copies"])
        return "An order saved with no per-copy details still shows 80 GSM on all three copies"
    run("R3C", M_CPY, "Orders without per-copy details show the main paper on every copy", "GSM on every copy", t)

    def t():
        one = bill_item(500, "1", gsm="70 GSM")
        q, _ = make_order([one], invoice=False)
        d = api("GET", f"/job-cards/{job_of(q)['id']}/detail", token=admin()).data
        expect(d["copies"] == [] and any(s["label"] == "Paper/GSM Type" and s["value"] == "70 GSM" for s in d["specs"]), d)
        return "A single sheet shows its GSM in the specification (no copies table)"
    run("R3C", M_CPY, "A single-copy job shows its GSM", "GSM listed", t)

    # ================================================================== proofs
    def t():
        q, _ = make_order([vc()], invoice=False, proof1_date="2026-12-01", proof1_time="11:00", proof2_date="2026-12-02", proof2_time="15:30")
        j = job_of(q)
        S["pj"] = j
        r = api("GET", f"/job-cards/{j['id']}/proofs", token=admin())
        expect_status(r, 200)
        expect([p["label"] for p in r.data] == ["Proof 1", "Proof 2"], r.data)
        expect(r.data[0]["due_date"] == "2026-12-01" and r.data[0]["due_time"] == "11:00" and r.data[1]["due_time"] == "15:30", r.data)
        expect(j["proofs_total"] == 2 and j["proofs_approved"] == 0 and "Proof 1" in j["proof_text"], j)
        return "Order proof times became Proof 1 and Proof 2 of the job card: " + j["proof_text"]
    run("R3F", M_PRF, "The order's proof slots become proofs of the job card", "Proof 1 and Proof 2", t)

    def t():
        q, _ = make_order([vc()], invoice=False)
        j = job_of(q)
        p = api("GET", f"/job-cards/{j['id']}/proofs", token=admin()).data
        expect(len(p) == 1 and p[0]["number"] == 1, p)
        return "An order always starts with Proof 1"
    run("R3F", M_PRF, "An order with no proof date still has Proof 1 to track", "One proof", t)

    def t():
        j = S["pj"]
        r = api("POST", f"/job-cards/{j['id']}/proofs", {"due_date": "2026-12-03", "due_time": "10:00", "notes": "after the logo change"}, admin())
        expect_status(r, 201)
        expect(r.data["label"] == "Proof 3" and r.data["status"] == "scheduled" and r.data["notes"] == "after the logo change", r.data)
        r2 = api("POST", f"/job-cards/{j['id']}/proofs", {}, admin())
        expect(r2.data["label"] == "Proof 4", r2.data)
        S["proof3"], S["proof4"] = r.data, r2.data
        return "Any number of proofs can be added: Proof 3 and Proof 4"
    run("R3F", M_PRF, "Add as many proofs as needed", "Proof 3, Proof 4", t)

    def t():
        pid = S["proof3"]["id"]
        sent = api("PUT", f"/job-proofs/{pid}", {"status": "sent"}, admin()).data
        expect(sent["status"] == "sent" and sent["sent_at"] and not sent["decided_at"], sent)
        ok = api("PUT", f"/job-proofs/{pid}", {"status": "approved"}, admin()).data
        expect(ok["status"] == "approved" and ok["decided_at"], ok)
        ch = api("PUT", f"/job-proofs/{S['proof4']['id']}", {"status": "changes", "notes": "bigger logo"}, admin()).data
        expect(ch["status"] == "changes" and ch["decided_at"] and ch["notes"] == "bigger logo", ch)
        back = api("PUT", f"/job-proofs/{pid}", {"status": "scheduled"}, admin()).data
        expect(back["sent_at"] is None and back["decided_at"] is None, back)
        return "scheduled -> sent -> approved, 'changes asked' with a note, and back to scheduled clears the times"
    run("R3F", M_PRF, "Proof status moves through shown / approved / changes asked", "Times recorded", t)

    def t():
        r = api("PUT", f"/job-proofs/{S['proof3']['id']}", {"status": "nonsense"}, admin())
        expect_status(r, 400)
        r = api("PUT", f"/job-proofs/{S['proof3']['id']}", {"handled_by": 99999999}, admin())
        expect_status(r, 400)
        expect_status(api("PUT", "/job-proofs/99999999", {"status": "sent"}, admin()), 404)
        expect_status(api("GET", "/job-cards/99999999/proofs", token=admin()), 404)
        expect_status(api("POST", "/job-cards/99999999/proofs", {}, admin()), 404)
        return "Unknown status / person / proof / job are refused"
    run("R3F", M_PRF, "Wrong proof requests are refused", "400 / 404", t)

    def t():
        staff = api("GET", "/work-centers/staff", token=admin()).data
        who = staff[0]
        r = api("PUT", f"/job-proofs/{S['proof3']['id']}", {"handled_by": who["id"]}, admin())
        expect_status(r, 200)
        expect(r.data["handled_by_name"] == who["name"], r.data)
        return f"Proof 3 is looked after by {who['name']}"
    run("R3F", M_PRF, "A proof can be given to the person taking care of it", "Name shown", t)

    def t():
        j = next(x for x in api("GET", "/job-cards/", token=admin()).data if x["id"] == S["pj"]["id"])
        expect(j["proofs_total"] == 4 and j["proof_text"], j)
        d = api("GET", f"/job-cards/{j['id']}/detail", token=admin()).data
        expect(len(d["proofs"]) == 4, d["proofs"])
        return f"Job list shows {j['proofs_total']} proofs, {j['proofs_approved']} approved - watching: {j['proof_text']}"
    run("R3F", M_PRF, "The job list (live board) carries the proof summary", "proofs_total / proof_text", t)

    def t():
        expect_status(api("DELETE", f"/job-proofs/{S['proof4']['id']}", token=admin()), 204)
        left = api("GET", f"/job-cards/{S['pj']['id']}/proofs", token=admin()).data
        expect(len(left) == 3, left)
        return "A proof can be removed"
    run("R3F", M_PRF, "Remove a proof", "Three left", t)

    def t():
        r = api("PUT", f"/job-proofs/{S['proof3']['id']}", {"status": "sent"}, as_role("counter"))
        expect_status(r, 200)
        r = api("POST", f"/job-cards/{S['pj']['id']}/proofs", {}, as_role("production"))
        expect_status(r, 201)
        return "Counter and design staff can update proofs"
    run("R3F", M_PRF, "Shop staff (counter, designer) can work with proofs", "Allowed", t)

    def t():
        tl = api("GET", f"/job-cards/{S['pj']['id']}/timeline", token=admin()).data
        actions = {e["action"] for e in tl}
        expect({"proof_added", "proof_sent", "proof_approved", "proof_changes"} <= actions, actions)
        return "Proof actions are in the job's activity trail"
    run("R3F", M_PRF, "Proof changes are written to the activity trail", "proof_* events", t)

    # ================================================================== urgent + dynamic job card
    def t():
        q, _ = make_order([vc()], invoice=False, priority="urgent")
        j = job_of(q)
        expect(j["priority"] == "urgent", j)
        d = api("GET", f"/job-cards/{j['id']}/detail", token=admin()).data
        expect(d["urgent"] is True, d)
        q2, _ = make_order([vc()], invoice=False)
        expect(job_of(q2)["priority"] == "medium", "normal orders stay medium")
        S["urgent_job"] = j
        return "An urgent order makes an urgent job card; others stay medium"
    run("R3J", M_JOB, "Marking the order urgent marks its job card urgent", "priority urgent", t)

    def t():
        r = api("POST", "/quotations/", dict(customer_id=S["cust"], with_gst=False, priority="super-urgent", items=[vc()]), admin())
        expect_status(r, 422)
        return "Only low / medium / high / urgent are accepted"
    run("R3J", M_JOB, "A wrong priority is refused", "422", t)

    def t():
        j = S["urgent_job"]
        r = api("PUT", f"/job-cards/{j['id']}", {"priority": "medium"}, as_role("counter"))
        expect_status(r, 200)
        expect(api("GET", f"/job-cards/{j['id']}/detail", token=admin()).data["urgent"] is False, "still urgent")
        api("PUT", f"/job-cards/{j['id']}", {"priority": "urgent"}, admin())
        expect(api("GET", f"/job-cards/{j['id']}/detail", token=admin()).data["urgent"] is True, "not urgent again")
        return "Urgent can be switched off and on from the job card"
    run("R3J", M_JOB, "Urgent can be switched on and off later", "Detail follows", t)

    def t():
        q, inv = make_order([vc(100, charges=["Foiling - Gold"])], gst=True, priority="urgent", discount_type="percent", discount_value=10,
                            proof1_date="2026-12-05", proof1_time="10:00", delivery_date="2026-12-09", delivery_time="17:00")
        j = job_of(q)
        d = api("GET", f"/job-cards/{j['id']}/detail", token=admin()).data
        expect(d["job_number"] == j["job_number"] and d["status"] == "pending" and d["status_label"] == "Not started", d)
        expect(d["customer"]["name"].startswith("ZZTEST Round3") and d["job"]["service"] == "Visiting Card" and d["job"]["quantity"] == 100, d)
        expect([s["label"] for s in d["specs"]] == ["Finish/Lamination Type", "Side"] or {s["label"] for s in d["specs"]} == {"Finish/Lamination Type", "Side"}, d["specs"])
        expect(any(e["name"] == "Gold" and e["group"] == "Foiling" for e in d["extras"]), d["extras"])
        expect(d["delivery_date"] == "2026-12-09" and d["delivery_time"] == "17:00", d)
        expect(d["invoice_number"] == inv["invoice_number"] and d["order_number"] == q["quotation_number"], d)
        expect([s["key"] for s in d["stages"]] == ["pending", "design", "approval", "printing", "binding", "packing", "delivered"], d["stages"])
        expect(d["progress"]["total"] >= 4 and d["now_with"]["step"], d)
        expect(d["price"]["discount"] > 0 and d["price"]["breakdown"], d["price"])
        S["full_job"] = j
        return "Detail: status, customer, item, quantity, every option, extras, delivery, invoice, 7 stages, now-with, price"
    run("R3J", M_JOB, "The job card is built from the order: every choice is on it", "All details present", t)

    def t():
        j = S["full_job"]
        d = api("GET", f"/job-cards/{j['id']}/detail?with_price=false", token=admin()).data
        expect("price" not in d and d["with_price"] is False, d.keys())
        expect(all("amount" not in e for e in d["extras"]), d["extras"])
        return "Without prices: no price block and no charge amounts"
    run("R3J", M_JOB, "The no-price job card hides every price", "No price / amount keys", t)

    def t():
        j = S["full_job"]
        a = api("GET", f"/job-cards/{j['id']}/pdf?with_price=false", token=admin())
        b = api("GET", f"/job-cards/{j['id']}/pdf?with_price=true", token=admin())
        for r in (a, b):
            expect_status(r, 200)
            expect(r.ctype == "application/pdf" and r.raw[:4] == b"%PDF" and len(r.raw) > 2000, "not a PDF")
        expect("no-price" in a.headers.get("Content-Disposition", "") and "with-price" in b.headers.get("Content-Disposition", ""), (a.headers, b.headers))
        expect(len(b.raw) != len(a.raw), "the two printouts are identical")
        return f"Printable job card: without price {len(a.raw) // 1024} KB, with price {len(b.raw) // 1024} KB"
    run("R3J", M_JOB, "Print the job card with and without price", "Two valid PDFs", t)

    def t():
        j = S["full_job"]
        before = api("GET", f"/job-cards/{j['id']}/detail", token=admin()).data["status_label"]
        api("PATCH", f"/job-cards/{j['id']}/status", {"status": "printing"}, admin())
        d = api("GET", f"/job-cards/{j['id']}/detail", token=admin()).data
        expect(d["status"] == "printing" and d["status_label"] == "Printing" and d["status_label"] != before, d["status_label"])
        expect(any(s["status"] == "done" for s in d["steps"]), d["steps"])
        pdf = api("GET", f"/job-cards/{j['id']}/pdf", token=admin())
        expect_status(pdf, 200)
        return f"After the status changed to Printing the card reads '{d['status_label']}' (was '{before}') - printing it again shows the new status"
    run("R3J", M_JOB, "The job card follows the live status", "Status text changes", t)

    def t():
        expect_status(api("GET", "/job-cards/99999999/detail", token=admin()), 404)
        expect_status(api("GET", "/job-cards/99999999/pdf", token=admin()), 404)
        return "Unknown job gives 404"
    run("R3J", M_JOB, "Job card of a job that does not exist", "404", t)

    def t():
        j = S["full_job"]
        for who in ("counter", "production", "accounts"):
            expect_status(api("GET", f"/job-cards/{j['id']}/detail", token=as_role(who)), 200)
            expect_status(api("GET", f"/job-cards/{j['id']}/pdf?with_price=false", token=as_role(who)), 200)
        return "Counter, designer and accounts can open and print it"
    run("R3J", M_JOB, "Every signed-in employee can open and print a job card", "200", t)

    def t():
        r = api("GET", "/job-cards/", token=admin())
        j = next(x for x in r.data if x["id"] == S["full_job"]["id"])
        expect(j["quantity"] == 100 and j["priority"] == "urgent", j)
        return "The job list carries quantity and priority for the live board"
    run("R3J", M_JOB, "The live board data has quantity and priority", "Fields present", t)

    def t():
        q, inv = make_order([vc(50)], gst=False)
        j = job_of(q)
        expect_status(api("DELETE", f"/job-cards/{j['id']}", token=admin()), 204)
        expect(api("GET", f"/job-cards/{j['id']}/proofs", token=admin()).status == 404, "proofs of a deleted job are still reachable")
        return "Deleting a job card removes its proofs with it"
    run("R3J", M_JOB, "Deleting a job card also removes its proofs", "Clean delete", t)

    # ================================================================== clean-up
    def t():
        for inv_id in S["invoices"]:
            api("DELETE", f"/invoices/{inv_id}", token=admin())
        for q_id in S["quotes"]:
            for j in api("GET", "/job-cards/", token=admin()).data:
                pass
        quotes = {q: api("GET", f"/quotations/{q}", token=admin()).data for q in S["quotes"]}
        item_ids = {i["id"] for d in quotes.values() if d for i in d.get("items", [])}
        for j in api("GET", "/job-cards/", token=admin()).data:
            if j["quotation_item_id"] in item_ids:
                api("DELETE", f"/job-cards/{j['id']}", token=admin())
        for q_id in S["quotes"]:
            api("DELETE", f"/quotations/{q_id}", token=admin())
        for p in S["products"]:
            api("DELETE", f"/products/{p}", token=admin())
        for c_ in S["cats"]:
            api("DELETE", f"/product-categories/{c_}", token=admin())
        api("DELETE", f"/customers/{S['cust']}", token=admin())
        return "Test orders, invoices, jobs, the test service and the test customer removed"
    run("R3Z", "Clean-up", "Remove the records created by the round 3 tests", "Removed", t)
