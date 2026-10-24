"""Vendors, inventory, purchases, cash ledger and cheques."""

import uuid

from framework import admin, api, as_role, expect, expect_status, run

TAG = uuid.uuid4().hex[:6]
S = {}


def run_all():
    # ------------------------------------------------------------------ vendors
    M = "Vendors"

    def t():
        r = api("POST", "/vendors/", {"name": f"ZZ Vendor {TAG}", "phone": "9000011111", "email": "v@example.com", "address": "Chennai", "gstin": "33AAKFS8888N1Z4"}, as_role("accounts"))
        expect_status(r, 201, 200)
        S["v"] = r.data["id"]
        expect(r.data["gstin"] == "33AAKFS8888N1Z4" and r.data["is_active"], r.data)
        return f"Vendor #{S['v']} created by an accounts user"
    run("VEN", M, "Accounts user adds a vendor with all details", "Created, active, GSTIN stored", t)

    def t():
        expect_status(api("POST", "/vendors/", {"name": "x"}, as_role("counter")), 403)
        return "403 Forbidden"
    run("VEN", M, "Counter user tries to add a vendor", "403 (admin / accounts only)", t)

    def t():
        expect_status(api("POST", "/vendors/", {"phone": "1"}, admin()), 422)
        return "422"
    run("VEN", M, "Add a vendor without a name", "Refused (422)", t)

    def t():
        r = api("GET", "/vendors/", token=as_role("counter"))
        expect_status(r, 200)
        expect(any(v["id"] == S["v"] for v in r.data), "not listed")
        return f"{len(r.data)} vendors visible to counter staff (read-only)"
    run("VEN", M, "Counter user can view the vendor list", "Vendor listed", t)

    def t():
        expect_status(api("GET", f"/vendors/{S['v']}", token=admin()), 200)
        expect_status(api("GET", "/vendors/99999999", token=admin()), 404)
        return "Found; unknown id gives 404"
    run("VEN", M, "Open a vendor (and an unknown one)", "200 / 404", t)

    def t():
        r = api("PUT", f"/vendors/{S['v']}", {"phone": "9000022222", "address": "T. Nagar, Chennai", "is_active": False}, admin())
        expect_status(r, 200)
        expect(r.data["phone"] == "9000022222" and r.data["is_active"] is False, r.data)
        api("PUT", f"/vendors/{S['v']}", {"is_active": True}, admin())
        return "Phone and address changed; deactivated, then reactivated"
    run("VEN", M, "Edit a vendor and switch it off / on", "Changes saved", t)

    # ------------------------------------------------------------------ inventory
    M = "Inventory"

    def t():
        r = api("POST", "/inventory/", {"name": f"ZZ Paper {TAG}", "unit": "reams", "current_qty": 2, "reorder_threshold": 5, "notes": "test"}, as_role("accounts"))
        expect_status(r, 201, 200)
        S["i"] = r.data["id"]
        expect(r.data["low_stock"] is True, "qty 2 below threshold 5 should be flagged")
        return "Created with qty 2 / reorder level 5 -> flagged low stock"
    run("INV2", M, "Add a stock item below its reorder level", "Created and flagged low-stock", t)

    def t():
        expect_status(api("POST", "/inventory/", {"name": f"ZZ Paper {TAG}"}, admin()), 400)
        return "400 already exists"
    run("INV2", M, "Add a stock item with a name that already exists", "Refused (400)", t)

    def t():
        expect_status(api("POST", "/inventory/", {"name": "x"}, as_role("counter")), 403)
        return "403"
    run("INV2", M, "Counter user tries to add a stock item", "403 (admin / accounts only)", t)

    def t():
        r = api("GET", "/inventory/low-stock", token=as_role("counter"))
        expect_status(r, 200)
        expect(any(x["id"] == S["i"] for x in r.data), "low item missing from low-stock list")
        return f"{len(r.data)} low-stock items; includes the new one"
    run("INV2", M, "Low-stock list includes the item", "Item present", t)

    def t():
        r = api("PUT", f"/inventory/{S['i']}", {"current_qty": 50}, admin())
        expect_status(r, 200)
        expect(r.data["low_stock"] is False, "still flagged low after raising to 50")
        low = api("GET", "/inventory/low-stock", token=admin()).data
        expect(not any(x["id"] == S["i"] for x in low), "still in low-stock list")
        return "Qty raised to 50 -> no longer low stock"
    run("INV2", M, "Increase stock above the reorder level", "Leaves the low-stock list", t)

    def t():
        r = api("PUT", f"/inventory/{S['i']}", {"reorder_threshold": 100, "unit": "sheets", "notes": "edited"}, admin())
        expect_status(r, 200)
        expect(r.data["low_stock"] is True and r.data["unit"] == "sheets", r.data)
        api("PUT", f"/inventory/{S['i']}", {"reorder_threshold": 5}, admin())
        return "Raising the reorder level flags it low again; unit/notes edited"
    run("INV2", M, "Edit unit, notes and reorder level", "Changes saved and low-stock recalculated", t)

    def t():
        r = api("GET", f"/inventory/{S['i']}", token=admin())
        expect_status(r, 200)
        expect_status(api("GET", "/inventory/99999999", token=admin()), 404)
        return "Found; unknown id gives 404"
    run("INV2", M, "Open a stock item (and an unknown one)", "200 / 404", t)

    # ------------------------------------------------------------------ purchases
    M = "Purchases"

    def buy(items, token=None, vendor=None):
        return api("POST", "/purchases/", {"vendor_id": vendor or S["v"], "notes": "UAT test purchase", "items": items}, token or as_role("accounts"))

    def t():
        before = api("GET", f"/inventory/{S['i']}", token=admin()).data["current_qty"]
        r = buy([{"inventory_item_id": S["i"], "quantity": 10, "unit_price": 240.5}])
        expect_status(r, 201, 200)
        d = r.data
        expect(abs(d["total_amount"] - 2405) < 0.01 and d["status"] == "unpaid" and d["purchase_number"], d)
        after = api("GET", f"/inventory/{S['i']}", token=admin()).data["current_qty"]
        expect(abs(after - before - 10) < 0.001, f"stock {before} -> {after}")
        S["p"] = d
        return f"{d['purchase_number']}: 10 x Rs240.50 = Rs2,405, unpaid; stock {before} -> {after}"
    run("PUR", M, "Record a purchase", "Total = qty x price; stock increases by the quantity", t)

    def t():
        r = buy([{"inventory_item_id": S["i"], "quantity": 2, "unit_price": 100}, {"inventory_item_id": S["i"], "quantity": 3, "unit_price": 50.25}])
        expect_status(r, 201, 200)
        expect(abs(r.data["total_amount"] - 350.75) < 0.01, r.data["total_amount"])
        S["p2"] = r.data
        return "Two lines: Rs200 + Rs150.75 = Rs350.75"
    run("PUR", M, "Purchase with two lines", "Total is the sum of the lines", t)

    def t():
        expect_status(buy([]), 400, 422)
        return "Refused"
    run("PUR", M, "Record a purchase with no items", "Refused", t)

    def t():
        expect_status(buy([{"inventory_item_id": S["i"], "quantity": 1, "unit_price": 1}], vendor=99999999), 404)
        return "404 Vendor not found"
    run("PUR", M, "Record a purchase for an unknown vendor", "404", t)

    def t():
        expect_status(buy([{"inventory_item_id": 99999999, "quantity": 1, "unit_price": 1}]), 404)
        return "404 Inventory item not found"
    run("PUR", M, "Record a purchase of an unknown stock item", "404", t)

    for qty, price in ((-5, 10), (5, -10), (0, 10)):
        def t(qty=qty, price=price):
            r = buy([{"inventory_item_id": S["i"], "quantity": qty, "unit_price": price}])
            expect(r.status in (400, 422), f"HTTP {r.status}: quantity {qty} / price {price} accepted (total Rs{(r.data or {}).get('total_amount')})")
            return f"HTTP {r.status} - refused"
        run("PUR", M, f"Purchase with quantity {qty} and price {price}", "Refused", t)

    def t():
        expect_status(buy([{"inventory_item_id": S["i"], "quantity": 1, "unit_price": 1}], token=as_role("counter")), 403)
        return "403"
    run("PUR", M, "Counter user tries to record a purchase", "403 (admin / accounts only)", t)

    def t():
        r = api("GET", "/purchases/", token=as_role("counter"))
        expect_status(r, 200)
        expect(any(p["id"] == S["p"]["id"] for p in r.data), "not listed")
        return f"{len(r.data)} purchases listed (read-only for counter)"
    run("PUR", M, "List purchases", "New purchase listed", t)

    def t():
        r = api("GET", f"/purchases/{S['p']['id']}", token=admin())
        expect_status(r, 200)
        expect(r.data["items"], "no items")
        expect_status(api("GET", "/purchases/99999999", token=admin()), 404)
        return "Detail with lines; unknown id 404"
    run("PUR", M, "Open a purchase", "Detail returned", t)

    def pay(amount, method="bank_transfer", pid=None, token=None):
        return api("POST", f"/purchases/{pid or S['p']['id']}/payments", {"amount": amount, "method": method}, token or as_role("accounts"))

    def t():
        r = pay(1000)
        expect_status(r, 200, 201)
        expect(r.data["status"] == "partially_paid" and abs(r.data["paid_amount"] - 1000) < 0.01, r.data)
        return "Rs1,000 paid -> Part-paid"
    run("PUR", M, "Pay a vendor part of a purchase", "Status Part-paid", t)

    for method in ("cash", "upi", "card", "credit"):
        def t(method=method):
            expect_status(pay(1, method), 200, 201)
            return f"{method} payment recorded"
        run("PUR", M, f"Pay a vendor by {method}", "Recorded", t)

    for amt in (0, -10):
        def t(amt=amt):
            expect_status(pay(amt), 400, 422)
            return "Refused"
        run("PUR", M, f"Vendor payment of Rs{amt}", "Refused", t)

    def t():
        d = api("GET", f"/purchases/{S['p']['id']}", token=admin()).data
        balance = round(d["total_amount"] - d["paid_amount"], 2)
        r = pay(balance + 100)
        expect(r.status in (400, 422), f"HTTP {r.status}: paid Rs{balance + 100} against a balance of Rs{balance}")
        return f"HTTP {r.status} - overpayment refused"
    run("PUR", M, "Pay a vendor more than the balance owed", "Refused", t)

    def t():
        d = api("GET", f"/purchases/{S['p']['id']}", token=admin()).data
        balance = round(d["total_amount"] - d["paid_amount"], 2)
        r = pay(balance)
        expect_status(r, 200, 201)
        expect(r.data["status"] == "paid", r.data["status"])
        return f"Final Rs{balance} paid -> Paid"
    run("PUR", M, "Pay the exact balance", "Status Paid", t)

    def t():
        expect_status(pay(10, pid=99999999), 404)
        return "404"
    run("PUR", M, "Pay against a purchase that does not exist", "404", t)

    def t():
        expect_status(pay(10, pid=S["p2"]["id"], token=as_role("counter")), 403)
        return "403"
    run("PUR", M, "Counter user tries to pay a vendor", "403 (admin / accounts only)", t)

    def t():
        r = api("DELETE", f"/vendors/{S['v']}", token=admin())
        expect(r.status < 500, f"HTTP {r.status}")
        return f"HTTP {r.status} - vendor with purchases handled cleanly"
    run("PUR", M, "Delete a vendor who has purchases", "Handled cleanly (no server error)", t)

    def t():
        r = api("DELETE", f"/inventory/{S['i']}", token=admin())
        expect(r.status < 500, f"HTTP {r.status}")
        return f"HTTP {r.status} - stock item with purchases handled cleanly"
    run("INV2", M, "Delete a stock item that was purchased", "Handled cleanly (no server error)", t)

    def t():
        r = api("POST", "/inventory/", {"name": f"ZZ Temp {TAG}"}, admin())
        expect_status(api("DELETE", f"/inventory/{r.data['id']}", token=admin()), 204, 200)
        expect_status(api("GET", f"/inventory/{r.data['id']}", token=admin()), 404)
        return "Unused stock item deleted"
    run("INV2", "Inventory", "Delete an unused stock item", "Deleted", t)

    def t():
        r = api("POST", "/vendors/", {"name": f"ZZ Temp Vendor {TAG}"}, admin())
        expect_status(api("DELETE", f"/vendors/{r.data['id']}", token=admin()), 204, 200)
        return "Unused vendor deleted"
    run("VEN", "Vendors", "Delete a vendor with no purchases", "Deleted", t)

    # ------------------------------------------------------------------ cash ledger
    M = "Cash Ledger"

    def summary(role="accounts"):
        r = api("GET", "/cash-ledger/summary", token=as_role(role))
        expect_status(r, 200)
        return r.data

    def t():
        expect_status(api("GET", "/cash-ledger/summary", token=as_role("counter")), 403)
        expect_status(api("GET", "/cash-ledger/summary", token=as_role("production")), 403)
        return "403 for counter and production"
    run("CSH", M, "Counter / production users open the cash ledger", "403 (admin / accounts only)", t)

    def t():
        expect_status(api("GET", "/cash-ledger/summary"), 401)
        return "401"
    run("CSH", M, "Open the cash ledger without signing in", "401", t)

    def t():
        a = summary()
        r = api("POST", "/cash-ledger/transactions", {"txn_type": "receipt", "amount": 1000, "note": "[UAT-TEST] cash received"}, as_role("accounts"))
        expect_status(r, 201)
        expect(r.data["created_by"], "created_by blank")
        b = summary()
        expect(abs(b["cash_in_hand"] - a["cash_in_hand"] - 1000) < 0.01 and abs(b["cash_in_bank"] - a["cash_in_bank"]) < 0.01, f"{a['cash_in_hand']} -> {b['cash_in_hand']}")
        return f"Cash in hand +Rs1,000 ({a['cash_in_hand']:,.2f} -> {b['cash_in_hand']:,.2f}); entry stamped by {r.data['created_by']}"
    run("CSH", M, "Record cash received (receipt)", "Cash in hand rises by the amount", t)

    def t():
        a = summary()
        expect_status(api("POST", "/cash-ledger/transactions", {"txn_type": "payment", "amount": 400, "note": "[UAT-TEST] tea"}, admin()), 201)
        b = summary()
        expect(abs(a["cash_in_hand"] - b["cash_in_hand"] - 400) < 0.01, f"{a['cash_in_hand']} -> {b['cash_in_hand']}")
        return "Cash in hand falls by Rs400"
    run("CSH", M, "Record cash paid out (payment)", "Cash in hand falls by the amount", t)

    def t():
        a = summary()
        expect_status(api("POST", "/cash-ledger/transactions", {"txn_type": "bank_deposit", "amount": 600, "note": "[UAT-TEST] deposit"}, admin()), 201)
        b = summary()
        expect(abs(a["cash_in_hand"] - b["cash_in_hand"] - 600) < 0.01 and abs(b["cash_in_bank"] - a["cash_in_bank"] - 600) < 0.01, f"{a} -> {b}")
        return "Cash in hand -Rs600 and bank +Rs600 (money moved, not lost)"
    run("CSH", M, "Deposit cash in the bank", "Cash in hand falls, bank balance rises by the same amount", t)

    for bad in ({"txn_type": "receipt", "amount": 0}, {"txn_type": "receipt", "amount": -50}, {"txn_type": "gift", "amount": 10}, {"amount": 10}):
        def t(bad=bad):
            r = api("POST", "/cash-ledger/transactions", bad, admin())
            expect(r.status in (400, 422), f"HTTP {r.status} - accepted {bad}")
            return f"HTTP {r.status} - refused"
        run("CSH", M, f"Invalid cash entry {bad}", "Refused", t)

    def t():
        s = summary()
        expect(s["transactions"], "no history")
        newest = s["transactions"][0]["id"]
        expect(all(s["transactions"][i]["id"] >= s["transactions"][i + 1]["id"] for i in range(len(s["transactions"]) - 1)), "history not newest-first")
        return f"{len(s['transactions'])} entries, newest first"
    run("CSH", M, "Cash history is listed newest first", "Newest entry on top", t)

    # ------------------------------------------------------------------ cheques
    M = "Cheques"

    def t():
        r = api("POST", "/cash-ledger/cheques", {"direction": "deposited", "cheque_no": f"T{TAG}", "amount": 5000, "party_name": "ZZ Customer", "bank_branch": "Indian Bank, T. Nagar",
                                                "cheque_date": "2026-10-20", "deposit_date": "2026-10-21", "notes": "[UAT-TEST]"}, as_role("accounts"))
        expect_status(r, 201)
        expect(r.data["status"] == "pending", r.data["status"])
        S["chq"] = r.data["id"]
        return "Received cheque saved as Pending"
    run("CHQ", M, "Record a cheque received from a customer", "Saved with status Pending", t)

    def t():
        r = api("POST", "/cash-ledger/cheques", {"direction": "issued", "cheque_no": f"I{TAG}", "amount": 2500, "party_name": "ZZ Vendor", "notes": "[UAT-TEST]"}, admin())
        expect_status(r, 201)
        S["chq2"] = r.data["id"]
        expect(r.data["direction"] == "issued", r.data)
        return "Issued cheque saved"
    run("CHQ", M, "Record a cheque issued to a vendor", "Saved as 'issued'", t)

    for st in ("cleared", "bounced", "pending"):
        def t(st=st):
            r = api("PATCH", f"/cash-ledger/cheques/{S['chq']}/status", {"status": st}, as_role("accounts"))
            expect_status(r, 200)
            expect(r.data["status"] == st, r.data["status"])
            return f"Status {st}"
        run("CHQ", M, f"Mark a cheque '{st}'", f"Status = {st}", t)

    def t():
        expect_status(api("PATCH", f"/cash-ledger/cheques/{S['chq']}/status", {"status": "lost"}, admin()), 422)
        return "422"
    run("CHQ", M, "Mark a cheque with an unknown status", "Refused (422)", t)

    def t():
        expect_status(api("PATCH", "/cash-ledger/cheques/99999999/status", {"status": "cleared"}, admin()), 404)
        return "404"
    run("CHQ", M, "Update a cheque that does not exist", "404", t)

    def t():
        r = api("GET", "/cash-ledger/cheques", token=as_role("accounts"))
        expect_status(r, 200)
        expect(any(c["id"] == S["chq"] for c in r.data) and any(c["id"] == S["chq2"] for c in r.data), "cheques missing")
        return f"{len(r.data)} cheques listed"
    run("CHQ", M, "List cheques", "Both new cheques listed", t)

    def t():
        r = api("POST", "/cash-ledger/cheques", {"direction": "deposited", "cheque_no": "X", "amount": -5}, admin())
        expect(r.status in (400, 422), f"HTTP {r.status}: negative cheque amount accepted")
        return f"HTTP {r.status} - refused"
    run("CHQ", M, "Cheque with a negative amount", "Refused", t)

    def t():
        expect_status(api("GET", "/cash-ledger/cheques", token=as_role("counter")), 403)
        return "403"
    run("CHQ", M, "Counter user opens the cheque register", "403 (admin / accounts only)", t)
