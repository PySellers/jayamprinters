"""Client round 4: 3-hour session, profile / contacts / about, the pre-filled paper job card, taking / assigning / adding
tasks on a job, and the admin-only AI Insights (forecast, service and employee performance, advice)."""

import base64
import json
import time
import uuid
from datetime import date, timedelta

import catalog
from framework import STAFF_PASSWORD, admin, api, as_role, expect, expect_status, run, token_for

TAG = uuid.uuid4().hex[:5]
PH = str(int(TAG, 16)).zfill(8)
M_SES = "Round 4 - Session & sign-in"
M_PRO = "Round 4 - Profile, Contacts, About"
M_SHT = "Round 4 - Pre-filled job card"
M_TSK = "Round 4 - Tasks on the job card"
M_INS = "Round 4 - AI Insights (admin only)"
S = {"quotes": [], "invoices": [], "jobs": [], "users": []}
STAFF = "staff@srijayam.com"


def login(email, password=STAFF_PASSWORD):
    return token_for(email, password)


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


def bill(qty=500, copies="1+1"):
    return catalog.item("Bill Books & Stationery", "Sheet Printing - 1/4", qty,
                        [("Document Type", "Bill Book"), ("Paper Name", "Excel Bond"), ("Paper/GSM Type", "80 GSM"), ("Copies per Set", copies)])


def steps(job_id, tok=None):
    r = api("GET", f"/job-cards/{job_id}/steps", token=tok or admin())
    expect_status(r, 200)
    return r.data


def named(job_id, name):
    return next(s for s in steps(job_id) if s["name"] == name)


def act(tok, step_id, action, body=None):
    return api("POST", f"/job-steps/{step_id}/{action}", body or {}, tok)


def sheet(job_id):
    r = api("GET", f"/job-cards/{job_id}/sheet", token=admin())
    expect_status(r, 200)
    return r.data["sheet"]


def run_all():
    catalog.clear()
    c = api("POST", "/customers/", {"name": f"ZZTEST Round4 {TAG}", "phone": "84" + PH + "0"}, admin())
    S["cust"] = c.data["id"]
    if not login(STAFF):  # the employee login the seed creates; created here when the seed has not been run
        api("POST", "/users/", {"name": "Staff User", "email": STAFF, "password": STAFF_PASSWORD, "role": "production"}, admin())
    tok = {"staff": login(STAFF), "counter": as_role("counter"), "accounts": as_role("accounts"), "production": as_role("production")}
    for k, v in tok.items():
        expect(v, f"no login for {k}")

    # ================================================================== session length
    def t():
        r = api("POST", "/auth/login", {"email": "admin@srijayam.com", "password": "Admin@123"})
        expect_status(r, 200)
        part = r.data["access_token"].split(".")[1]
        payload = json.loads(base64.urlsafe_b64decode(part + "=" * (-len(part) % 4)))
        left = payload["exp"] - time.time()
        expect(10800 - 120 <= left <= 10800 + 120, f"token valid for {left / 3600:.2f} h")
        return f"The sign-in token lasts {left / 3600:.2f} hours (3 hours)"
    run("R4S", M_SES, "A new sign-in stays valid for 3 hours", "About 10,800 seconds", t)

    def t():
        r = api("GET", "/auth/about", token=admin())
        expect_status(r, 200)
        expect(r.data["session_hours"] == 3.0 and r.data["version"] and r.data["release_date"], r.data)
        expect_status(api("GET", "/auth/about"), 401)
        return f"About shows version {r.data['version']} ({r.data['release_date']}) and the 3-hour session; needs sign-in"
    run("R4S", M_SES, "About information (version, release, session length)", "Version + 3 hours; 401 without sign-in", t)

    def t():
        r = api("POST", "/auth/login", {"email": STAFF, "password": STAFF_PASSWORD})
        expect_status(r, 200)
        expect(r.data["user"]["role"] == "production" and r.data["user"]["email"] == STAFF, r.data)
        expect_status(api("POST", "/auth/login", {"email": STAFF, "password": "wrong"}), 401)
        return "The test employee login works (role production) and a wrong password is refused"
    run("R4S", M_SES, "The employee test login (staff@srijayam.com)", "Signs in as a production employee", t)

    def t():
        out = []
        for path in ("/reports/insights", "/users/", "/cash-ledger/summary"):
            expect_status(api("GET", path, token=tok["staff"]), 403)
            out.append(path)
        expect_status(api("POST", "/product-categories/", {"name": "ZZ x"}, tok["staff"]), 403)
        return "The employee gets 403 on Insights, Users, Cash Ledger and on changing services"
    run("R4S", M_SES, "The employee cannot reach the admin screens", "403", t)

    # ================================================================== profile, contacts
    def t():
        r = api("PATCH", "/auth/me", {"name": "Staff User", "phone": "90000 11111", "role": "admin", "email": "x@y.z"}, tok["staff"])
        expect_status(r, 200)
        me = api("GET", "/auth/me", token=tok["staff"]).data
        expect(me["phone"] == "90000 11111" and me["role"] == "production" and me["email"] == STAFF, me)
        expect_status(api("PATCH", "/auth/me", {"name": ""}, tok["staff"]), 422)
        expect_status(api("PATCH", "/auth/me", {"phone": "1"}), 401)
        return "Phone saved; role and e-mail cannot be changed by the employee; empty name refused; needs sign-in"
    run("R4P", M_PRO, "An employee edits their own name and phone", "Saved; role/e-mail untouched", t)

    def t():
        u = api("POST", "/users/", {"name": f"ZZ Pwd {TAG}", "email": f"zzpwd{TAG}@srijayam.com", "password": "Old@12345", "role": "counter", "phone": "98765 43210"}, admin())
        expect_status(u, 201)
        S["users"].append(u.data["id"])
        expect(u.data["phone"] == "98765 43210", u.data)
        mail = f"zzpwd{TAG}@srijayam.com"
        t1 = login(mail, "Old@12345")
        expect(t1, "no login")
        expect_status(api("POST", "/auth/change-password", {"current_password": "bad", "new_password": "New@12345"}, t1), 400)
        expect_status(api("POST", "/auth/change-password", {"current_password": "Old@12345", "new_password": "Old@12345"}, t1), 400)
        expect_status(api("POST", "/auth/change-password", {"current_password": "Old@12345", "new_password": "abc"}, t1), 422)
        expect_status(api("POST", "/auth/change-password", {"current_password": "Old@12345", "new_password": "New@12345"}, t1), 204)
        r = api("POST", "/auth/login", {"email": mail, "password": "Old@12345"})
        expect(r.status == 401, "old password still works")
        r = api("POST", "/auth/login", {"email": mail, "password": "New@12345"})
        expect_status(r, 200)
        return "Wrong current password, same password and a short password are refused; the new password works and the old one stops"
    run("R4P", M_PRO, "An employee changes their own password", "Rules enforced; new password works", t)

    def t():
        r = api("GET", "/auth/contacts", token=tok["staff"])
        expect_status(r, 200)
        rows = r.data
        expect(rows[0]["role"] == "admin", f"admin should be first: {rows[0]}")
        me = next(x for x in rows if x["email"] == STAFF)
        expect(me["phone"] == "90000 11111", me)
        expect(all("hashed_password" not in x and "password" not in json.dumps(x).lower() for x in rows), "password data leaked")
        expect_status(api("GET", "/auth/contacts"), 401)
        return f"{len(rows)} contacts, Admin first, the employee's phone is listed, no password data; 401 without sign-in"
    run("R4P", M_PRO, "Contacts list: every employee sees Admin first with phone numbers", "Admin first; phones; no secrets", t)

    def t():
        users = api("GET", "/users/", token=admin()).data
        target = next(u for u in users if u["email"] == f"zzpwd{TAG}@srijayam.com")
        r = api("PATCH", f"/users/{target['id']}", {"phone": "  "}, admin())
        expect_status(r, 200)
        expect(r.data["phone"] is None, r.data)
        r = api("PATCH", f"/users/{target['id']}", {"phone": "99999 88888"}, admin())
        expect(r.data["phone"] == "99999 88888", r.data)
        listed = next(x for x in api("GET", "/auth/contacts", token=tok["staff"]).data if x["id"] == target["id"])
        expect(listed["phone"] == "99999 88888", listed)
        return "Admin sets / clears an employee's phone on the Users screen and Contacts follows"
    run("R4P", M_PRO, "Admin edits an employee's phone number", "Stored, blank clears it, Contacts follows", t)

    # ================================================================== the pre-filled paper job card
    q, inv, job = make_order(bill(500, "1+1"), delivery_date=str(date.today() + timedelta(days=3)), proof1_date=str(date.today() + timedelta(days=1)), proof1_time="11:30")
    S["bill"] = (q, inv, job)

    def t():
        sh = sheet(job["id"])
        expect("Bill Book" in sh["job_name"] and "Bill Books" in sh["job_name"], sh["job_name"])
        expect(sh["party_name"].startswith("ZZTEST Round4") and sh["mobile"], (sh["party_name"], sh["mobile"]))
        expect(sh["size"] == "1/4", sh["size"])
        expect(sh["type_of_printing"] == ["Offset"], sh["type_of_printing"])
        return f"Party, mobile, job name '{sh['job_name']}', size {sh['size']} and Offset are filled in from the order"
    run("R4J", M_SHT, "The paper job card comes with party, job, size and type of printing", "Filled from the order", t)

    def t():
        sh = sheet(job["id"])
        rows = sh["paper"]
        expect(rows[0]["range"] == "Excel Bond" and rows[0]["kgs"] == "80 GSM", rows[0])
        expect(rows[1]["range"] == "Excel Bond" and rows[1]["kgs"] == "80 GSM", rows[1])
        expect(rows[0]["qty"] == "500" and rows[1]["qty"] == "500", [r["qty"] for r in rows])
        expect(len(rows) == 2, "the form has one row per copy (no unused copy rows any more)")
        expect(sh["cutting_size"] == "1/4", sh["cutting_size"])
        return "Paper range, GSM and quantity are filled for each of the 2 copies; no unused copy rows"
    run("R4J", M_SHT, "Paper table: range, GSM and quantity of every copy", "One row per copy", t)

    def t():
        sh = sheet(job["id"])
        expect(sh["delivery_date"] == str(date.today() + timedelta(days=3)), sh["delivery_date"])
        expect(sh["proof1_date"] == str(date.today() + timedelta(days=1)) and sh["proof1_time"] == "11:30", (sh["proof1_date"], sh["proof1_time"]))
        return "Proof 1 and delivery date-time come from the order"
    run("R4J", M_SHT, "Proof and delivery dates are filled", "From the order", t)

    def t():
        sh = sheet(job["id"])
        det = api("GET", f"/job-cards/{job['id']}/detail?with_price=true", token=admin()).data
        rate = det["price"]["rate"]
        expect(abs(float(sh["payment"]["rate"].replace(",", "")) - rate) < 0.01, (sh["payment"]["rate"], rate))
        expect(abs(float(sh["payment"]["first"].replace(",", "")) - inv["grand_total"]) < 0.01, sh["payment"]["first"])
        expect(abs(float(sh["payment"]["balance1"].replace(",", "")) - inv["grand_total"]) < 0.01, (sh["payment"]["balance1"], inv["grand_total"]))
        expect(sh["payment"]["advance"] == "", sh["payment"]["advance"])
        return f"Rate {sh['payment']['rate']} and balance {sh['payment']['balance1']} match the bill; no advance yet"
    run("R4J", M_SHT, "Payment column: rate, bill total and balance", "Match the invoice", t)

    def t():
        pay = api("POST", f"/invoices/{inv['id']}/payments", {"amount": 100.0, "method": "cash"}, admin())
        expect_status(pay, 200, 201)
        sh = sheet(job["id"])
        expect(sh["payment"]["advance"] == "100", sh["payment"]["advance"])
        expect("Half Payment" in sh["job_position"], sh["job_position"])
        expect(abs(float(sh["payment"]["balance1"].replace(",", "")) - (inv["grand_total"] - 100)) < 0.01, sh["payment"]["balance1"])
        return "After a Rs100 payment: advance 100, balance down by 100 and 'Half Payment' is ticked"
    run("R4J", M_SHT, "Money received shows on the form straight away", "Advance, balance and Half Payment follow", t)

    def t():
        s1 = named(job["id"], "Design / DTP")
        expect_status(act(admin(), s1["id"], "start"), 200)
        expect_status(act(admin(), s1["id"], "complete"), 200)
        s2 = named(job["id"], "Proof approval")
        expect_status(act(admin(), s2["id"], "start"), 200)
        expect_status(act(admin(), s2["id"], "complete"), 200)
        s3 = named(job["id"], "Printing")
        expect_status(act(admin(), s3["id"], "start"), 200)
        expect_status(act(admin(), s3["id"], "complete"), 200)
        sh = sheet(job["id"])
        expect("Printing" in sh["job_position"], sh["job_position"])
        expect("Binding" not in sh["job_position"], sh["job_position"])
        s4 = named(job["id"], "Binding / numbering")
        expect_status(act(admin(), s4["id"], "start"), 200)
        expect_status(act(admin(), s4["id"], "complete"), 200)
        sh = sheet(job["id"])
        expect("Binding" in sh["job_position"] and "Ready" in sh["job_position"], sh["job_position"])
        return f"Job Position ticks follow the real progress: {', '.join(sh['job_position'])}"
    run("R4J", M_SHT, "Job Position ticks follow the steps that are finished", "Printing, then Binding + Ready", t)

    def t():
        sh = sheet(job["id"])
        body = {**sh, "remarks": "Hand-written change", "mobile": "9999900000"}
        r = api("PUT", f"/job-cards/{job['id']}/sheet", {"sheet": body}, admin())
        expect_status(r, 200)
        got = r.data["sheet"]
        expect(got["remarks"] == "Hand-written change" and got["mobile"] == "9999900000", got["remarks"])
        saved = api("GET", f"/job-cards/{job['id']}", token=admin())
        expect_status(saved, 200)
        # untouched cells keep following the order: a second payment must still show
        pay = api("POST", f"/invoices/{inv['id']}/payments", {"amount": 50.0, "method": "upi"}, admin())
        expect_status(pay, 200, 201)
        after = sheet(job["id"])
        expect(after["remarks"] == "Hand-written change", "the typed remarks were lost")
        expect(after["payment"]["advance"] == "150", after["payment"]["advance"])
        return "Typed remarks and mobile are kept; cells nobody touched (advance 150) keep following the order"
    run("R4J", M_SHT, "What staff type is kept; untouched cells keep following the order", "Typed text kept, the rest live", t)

    def t():
        r = api("POST", f"/job-cards/{job['id']}/sheet/reset", token=admin())
        expect_status(r, 200)
        sh = r.data["sheet"]
        expect(sh["remarks"] != "Hand-written change", sh["remarks"])
        expect(sh["mobile"] != "9999900000", sh["mobile"])
        expect(sh["paper"][0]["range"] == "Excel Bond", sh["paper"][0])
        expect_status(api("POST", "/job-cards/99999999/sheet/reset", token=admin()), 404)
        return "'Fill again from the order' brings back the order's values (typed remarks / mobile gone)"
    run("R4J", M_SHT, "Reset the form to what the order says", "Typing discarded, order values back", t)

    def t():
        q2, inv2, job2 = make_order(catalog.item("Xerox / Photocopy", "Xerox / Photocopy", 40, [("Paper Size", "A4"), ("Colour", "Colour"), ("Print Side", "Double Side")]))
        sh = sheet(job2["id"])
        expect(sh["type_of_printing"] == ["Xerox"], sh["type_of_printing"])
        expect(sh["size"] == "A4" and "Double Side" in sh["paper"][0]["printing"] and sh["paper"][0]["qty"] == "40", (sh["size"], sh["paper"][0]))
        q3, inv3, job3 = make_order(vc(100))
        sh = sheet(job3["id"])
        expect(sh["type_of_printing"] == ["Offset"] and sh["paper"][0]["qty"] == "100", sh)
        return "Xerox job: Xerox ticked, A4, double side, 40; Visiting Card: Offset, 100"
    run("R4J", M_SHT, "Other services fill in too (Xerox, Visiting Card)", "Type of printing, size and quantity", t)

    # ================================================================== tasks on the job card
    q, inv, job = make_order(vc(100))
    jid = job["id"]

    def t():
        s1 = named(jid, "Design / DTP")
        staff_view = steps(jid, tok["staff"])[0]
        expect(staff_view["can_act"] is True, "an employee in no work center should be able to take an open step")
        r = act(tok["staff"], s1["id"], "claim")
        expect_status(r, 200)
        expect(r.data["assigned_to_name"] == "Staff User", r.data)
        lst = next(j for j in api("GET", "/job-cards/", token=admin()).data if j["id"] == jid)
        expect(lst["current_assignee"] == "Staff User" and lst["current_work_center"] == "Design", lst)
        return "The employee takes the Design step; the job list (Live Jobs) now says 'Design: Staff User'"
    run("R4T", M_TSK, "An employee takes a task and it shows on Live Jobs", "Assigned to them; section + name on the job list", t)

    def t():
        s2 = named(jid, "Proof approval")
        r = act(tok["accounts"], s2["id"], "claim")
        expect_status(r, 403)
        return "An Accounts user cannot take a production task"
    run("R4T", M_TSK, "Accounts staff cannot take production tasks", "403", t)

    def t():
        s2 = named(jid, "Printing")
        uid = next(u["id"] for u in api("GET", "/users/", token=admin()).data if u["email"] == STAFF)
        expect_status(act(admin(), s2["id"], "assign", {"user_id": uid}), 200)
        again = named(jid, "Printing")
        expect(again["assigned_to"] == uid, again)
        expect_status(act(tok["staff"], s2["id"], "assign", {"user_id": None}), 403)
        others = [u["id"] for u in api("GET", "/users/", token=admin()).data if u["email"] == "counter@srijayam.com"]
        expect_status(act(tok["staff"], s2["id"], "assign", {"user_id": others[0]}), 403)
        expect_status(act(tok["counter"], s2["id"], "assign", {"user_id": None}), 200)
        return "Admin assigns the Printing task to the employee; the employee cannot assign others or un-assign; the counter (supervisor) can"
    run("R4T", M_TSK, "Admin / counter assign tasks; an employee cannot assign others", "Assigned; 403 for the employee", t)

    def t():
        before = steps(jid)
        design = named(jid, "Design / DTP")
        r = api("POST", f"/job-cards/{jid}/steps", {"name": "Foil stamping", "work_center_id": None, "after_step_id": design["id"]}, tok["counter"])
        expect_status(r, 201)
        names = [s["name"] for s in r.data]
        expect(names[:3] == ["Design / DTP", "Foil stamping", "Proof approval"], names)
        added = next(s for s in r.data if s["name"] == "Foil stamping")
        expect(added["stage"] == "design", f"a task in the design part should keep the design stage, got {added['stage']}")
        expect([s["position"] for s in r.data] == list(range(1, len(before) + 2)), "positions not 1..n")
        job_now = api("GET", f"/job-cards/{jid}", token=admin()).data
        expect(job_now["status"] in ("pending", "design"), f"the job status jumped to {job_now['status']}")
        return "An extra task added after Design sits between Design and Proof approval, keeps the design stage, and renumbers the rest"
    run("R4T", M_TSK, "Add a task in between the usual tasks", "Placed after the chosen step; stage of its neighbour", t)

    def t():
        r = api("POST", f"/job-cards/{jid}/steps", {"name": "Pack in boxes"}, tok["counter"])
        expect_status(r, 201)
        names = [s["name"] for s in r.data]
        expect(names[-1] == "Handover & delivery" and names[-2] == "Pack in boxes", names)
        added = next(s for s in r.data if s["name"] == "Pack in boxes")
        prev = r.data[-3]
        expect(added["stage"] == prev["stage"], f"stage {added['stage']} but the step before it is {prev['stage']}")
        return "With no position given the task goes in front of the final hand-over, with the stage of the step before it"
    run("R4T", M_TSK, "Add a task without choosing a position", "Before the hand-over", t)

    def t():
        design = named(jid, "Design / DTP")
        r = api("POST", f"/job-cards/{jid}/steps", {"name": "Customer sample", "after_step_id": design["id"]}, tok["staff"])
        expect_status(r, 201)  # the employee holds the Design step of this job
        r = api("POST", f"/job-cards/{S['jobs'][0]}/steps", {"name": "Not mine"}, tok["staff"])
        expect_status(r, 403)
        expect_status(api("POST", f"/job-cards/{jid}/steps", {"name": "x"}, tok["accounts"]), 403)
        uid = next(u["id"] for u in api("GET", "/users/", token=admin()).data if u["email"] == STAFF)
        expect_status(api("POST", f"/job-cards/{jid}/steps", {"name": "Given", "assigned_to": uid}, tok["staff"]), 403)
        r = api("POST", f"/job-cards/{jid}/steps", {"name": "Given to staff", "assigned_to": uid, "after_step_id": design["id"]}, admin())
        expect_status(r, 201)
        given = next(s for s in r.data if s["name"] == "Given to staff")
        expect(given["assigned_to"] == uid, given)
        expect_status(api("POST", f"/job-cards/{jid}/steps", {"name": "Nobody", "assigned_to": 99999999}, admin()), 404)
        expect_status(api("POST", f"/job-cards/{jid}/steps", {"name": "Bad", "after_step_id": 99999999}, admin()), 404)
        return "The employee holding a step may add a task to that job (not to others); Accounts cannot; only a supervisor can give it to someone; bad input refused"
    run("R4T", M_TSK, "Who may add a task, and giving it to a person", "Allowed / 403 as described", t)

    def t():
        q9, inv9, job9 = make_order(vc(100))
        for name in ("Design / DTP", "Proof approval"):
            s = named(job9["id"], name)
            expect_status(act(admin(), s["id"], "start"), 200)
            expect_status(act(admin(), s["id"], "complete"), 200)
        design = named(job9["id"], "Design / DTP")
        r = api("POST", f"/job-cards/{job9['id']}/steps", {"name": "Too late", "after_step_id": design["id"]}, admin())
        expect_status(r, 409)
        printing = named(job9["id"], "Printing")
        r = api("POST", f"/job-cards/{job9['id']}/steps", {"name": "After the finished ones", "after_step_id": printing["id"]}, admin())
        expect_status(r, 201)
        return "A task cannot be wedged in front of a finished step (409); after the last finished one it is fine"
    run("R4T", M_TSK, "A task cannot go in front of work that is already finished", "409 / 201", t)

    def t():
        for st in steps(jid):
            if st["status"] not in ("done", "skipped"):
                expect_status(act(admin(), st["id"], "skip"), 200)
        done = api("GET", f"/job-cards/{jid}", token=admin()).data
        expect(done["status"] == "delivered", done["status"])
        expect_status(api("POST", f"/job-cards/{jid}/steps", {"name": "After delivery"}, admin()), 409)
        return "A delivered job takes no more tasks"
    run("R4T", M_TSK, "No task can be added to a delivered job", "409", t)

    # ================================================================== AI Insights
    def t():
        r = api("GET", "/reports/insights", token=admin())
        expect_status(r, 200)
        d = r.data
        for key in ("headline", "monthly", "forecast", "weekdays", "services", "customers", "work_centers", "employees", "delivery_risk", "receivables", "recommendations"):
            expect(key in d, f"missing {key}")
        expect(len(d["monthly"]) == 12 and len(d["forecast"]["months"]) == 3 and len(d["weekdays"]) == 7, "chart series have the wrong length")
        return f"All sections present: {len(d['services'])} services, {len(d['employees'])} employees, {len(d['recommendations'])} advice points"
    run("R4I", M_INS, "The Admin gets the full AI Insights report", "Every section present", t)

    def t():
        for role in ("counter", "accounts", "production", "staff"):
            expect_status(api("GET", "/reports/insights", token=tok[role]), 403)
        expect_status(api("GET", "/reports/insights"), 401)
        # sales and profit are the owner's too: the financial statement and the sales report are Admin only
        today = date.today()
        for role in ("counter", "accounts", "production", "staff"):
            for path in (f"/reports/statement?start={today.replace(day=1)}&end={today}", f"/reports/statement/export?start={today.replace(day=1)}&end={today}",
                         f"/reports/sales?start={today.replace(day=1)}&end={today}", f"/reports/sales/export?start={today.replace(day=1)}&end={today}"):
                expect_status(api("GET", path, token=tok[role]), 403)
        expect_status(api("GET", f"/reports/statement?start={today.replace(day=1)}&end={today}", token=admin()), 200)
        return "Counter, Accounts, Production and the employee all get 403 on Insights, the profit statement and the sales report (401 signed out); Admin still gets them"
    run("R4I", M_INS, "AI Insights, the profit statement and the sales report are for the Admin only", "403 for every other role", t)

    def t():
        expect_status(api("GET", "/reports/insights?days=5", token=admin()), 422)
        expect_status(api("GET", "/reports/insights?days=9999", token=admin()), 422)
        for days in (30, 90, 365):
            expect_status(api("GET", f"/reports/insights?days={days}", token=admin()), 200)
        return "30 / 90 / 365 days work; fewer than 30 or more than 730 are refused"
    run("R4I", M_INS, "The period must be sensible", "422 for out-of-range days", t)

    def t():
        d = api("GET", "/reports/insights?days=365", token=admin()).data
        start = date.fromisoformat(d["period"]["start"])
        end = date.fromisoformat(d["period"]["end"])
        total = 0.0
        count = 0
        for inv in api("GET", "/invoices/", token=admin()).data:
            when = date.fromisoformat(inv["invoice_date"])
            if start <= when <= end:
                total += (inv["subtotal"] or 0) - (inv["discount_amount"] or 0)
                count += 1
        expect(abs(d["headline"]["revenue"] - round(total, 2)) < 0.05, f"report {d['headline']['revenue']} vs invoices {total:.2f}")
        expect(d["headline"]["orders"] == count, (d["headline"]["orders"], count))
        by_service = sum(s["revenue"] for s in d["services"])
        expect(abs(by_service - d["headline"]["revenue"]) < 1.0, f"services add to {by_service}, sales are {d['headline']['revenue']}")
        monthly = sum(m["revenue"] for m in d["monthly"])
        expect(monthly >= d["headline"]["revenue"] - 1.0, f"monthly {monthly} < period {d['headline']['revenue']}")
        return f"Sales Rs{d['headline']['revenue']:,.2f} over {count} invoices = the invoices' own total; the service split adds up to the same"
    run("R4I", M_INS, "The report's sales equal the invoices (independent check)", "Same total, same count, services add up", t)

    def t():
        d = api("GET", "/reports/insights", token=admin()).data
        f = d["forecast"]
        for m in f["months"]:
            expect(m["low"] <= m["revenue"] <= m["high"] and m["revenue"] >= 0, m)
        expect(f["confidence"] in ("low", "medium", "high") and f["trend"] in ("up", "down", "flat"), f)
        expect(f["this_month_projection"] >= f["this_month_so_far"] - 0.01, f)
        shares = [s["share"] for s in d["services"] if s["share"] is not None]
        expect(abs(sum(shares) - 100) < 1.0, f"service shares add to {sum(shares)}")
        return "Forecast ranges bracket the expected value, month-end projection is not below the sales so far, service shares add to 100%"
    run("R4I", M_INS, "Forecast and shares are consistent", "low <= expected <= high; shares = 100%", t)

    def t():
        d = api("GET", "/reports/insights", token=admin()).data
        names = {e["name"] for e in d["employees"]}
        expect("Staff User" in names, names)
        emp = next(e for e in d["employees"] if e["name"] == "Staff User")
        expect(emp["score"] is None or 0 <= emp["score"] <= 100, emp)
        scored = [e for e in d["employees"] if e["score"] is not None]
        expect([e.get("rank") for e in scored] == list(range(1, len(scored) + 1)), "ranks are not 1..n")
        # an employee who finishes a step is counted
        q5, inv5, job5 = make_order(vc(100))
        s = named(job5["id"], "Design / DTP")
        expect_status(act(tok["staff"], s["id"], "claim"), 200)
        expect_status(act(tok["staff"], s["id"], "start"), 200)
        expect_status(act(tok["staff"], s["id"], "complete"), 200)
        after = next(e for e in api("GET", "/reports/insights", token=admin()).data["employees"] if e["name"] == "Staff User")
        expect(after["steps_done"] >= emp["steps_done"] + 1, (emp["steps_done"], after["steps_done"]))
        return f"Employee table lists every active person; a finished step is counted (Staff User: {after['steps_done']} done, score {after['score']})"
    run("R4I", M_INS, "Employee performance counts the steps people finish", "Listed, ranked, counted", t)

    def t():
        d = api("GET", "/reports/insights", token=admin()).data
        kinds = {"risk", "opportunity", "insight", "good", "info"}
        expect(all(t_["kind"] in kinds and t_["title"] and t_["detail"] for t_ in d["recommendations"]), "advice with a missing field")
        order = ["risk", "opportunity", "insight", "good", "info"]
        ranks = [order.index(t_["kind"]) for t_ in d["recommendations"]]
        expect(ranks == sorted(ranks), "advice is not ordered most important first")
        for r in d["delivery_risk"]:
            expect(r["days_late"] >= 1 or r["already_late"], r)
        return f"{len(d['recommendations'])} advice points, most important first; every 'likely late' job is genuinely past or beyond its date"
    run("R4I", M_INS, "Advice is complete and ordered; late-risk list is genuine", "Risk first; no false 'late'", t)

    # ================================================================== clean-up
    def t():
        for inv_id in S["invoices"]:
            api("DELETE", f"/invoices/{inv_id}", token=admin())
        quotes = {q_: api("GET", f"/quotations/{q_}", token=admin()).data for q_ in S["quotes"]}
        item_ids = {i["id"] for d in quotes.values() if d for i in d.get("items", [])}
        for j in api("GET", "/job-cards/", token=admin()).data:
            if j["quotation_item_id"] in item_ids:
                api("DELETE", f"/job-cards/{j['id']}", token=admin())
        for q_id in S["quotes"]:
            api("DELETE", f"/quotations/{q_id}", token=admin())
        for u in S["users"]:
            api("DELETE", f"/users/{u}", token=admin())
        api("DELETE", f"/customers/{S['cust']}", token=admin())
        return "Test orders, invoices, jobs, the test user and the test customer removed"
    run("R4Z", "Clean-up", "Remove the records created by the round 4 tests", "Removed", t)
