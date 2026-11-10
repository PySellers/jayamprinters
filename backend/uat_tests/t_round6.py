"""Client round 6: every employee updates their own work separately (progress updates on their tasks) and the work of ONE
person can be pulled out on its own (Work Log for one employee, the team summary, Excel)."""

import urllib.request
import uuid
from datetime import date, timedelta

import catalog
from framework import BASE, STAFF_PASSWORD, admin, api, as_role, expect, expect_status, run, token_for

TAG = uuid.uuid4().hex[:5]
PH = str(int(TAG, 16)).zfill(8)
M_UPD = "Round 6 - Each worker updates their own work"
M_LOG = "Round 6 - One person's work taken out on its own"
S = {"quotes": [], "invoices": [], "jobs": []}


def raw(path, token):
    req = urllib.request.Request(BASE + path, headers={"Authorization": "Bearer " + token})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, r.read(), r.headers
    except urllib.error.HTTPError as e:
        return e.code, e.read(), e.headers


def make_job():
    item = catalog.item("Visiting Card", "Visiting Card", 100, [("Finish/Lamination Type", "Without Lamination"), ("Side", "Single Side")])
    q = api("POST", "/quotations/", dict(customer_id=S["cust"], with_gst=False, is_order=True, items=[item]), admin())
    expect_status(q, 200, 201)
    S["quotes"].append(q.data["id"])
    expect_status(api("POST", f"/quotations/{q.data['id']}/convert", token=admin()), 200, 201)
    inv = api("POST", f"/invoices/from-quotation/{q.data['id']}", token=admin())
    expect_status(inv, 200, 201)
    S["invoices"].append(inv.data["id"])
    job = next(j for j in api("GET", "/job-cards/", token=admin()).data if j["quotation_item_id"] == q.data["items"][0]["id"])
    S["jobs"].append(job["id"])
    return job


def steps(job_id):
    r = api("GET", f"/job-cards/{job_id}/steps", token=admin())
    expect_status(r, 200)
    return r.data


def act(tok, step_id, action, body=None):
    return api("POST", f"/job-steps/{step_id}/{action}", body or {}, tok)


def run_all():
    catalog.clear()
    c = api("POST", "/customers/", {"name": f"ZZTEST Round6 {TAG}", "phone": "82" + PH}, admin())
    expect_status(c, 200, 201)
    S["cust"] = c.data["id"]
    emails = {"a": f"zzwl-a{TAG}@srijayam.com", "b": f"zzwl-b{TAG}@srijayam.com"}
    ids = {}
    for key, email in emails.items():
        u = api("POST", "/users/", {"name": f"ZZ Worker {key.upper()} {TAG}", "email": email, "password": STAFF_PASSWORD, "role": "production"}, admin())
        expect_status(u, 200, 201)
        ids[key] = u.data["id"]
    A, B = token_for(emails["a"], STAFF_PASSWORD), token_for(emails["b"], STAFF_PASSWORD)
    counter, accounts = as_role("counter"), as_role("accounts")
    today = date.today().isoformat()

    job_a, job_b = make_job(), make_job()
    step_a = next(s for s in steps(job_a["id"]) if s["status"] == "ready")
    step_b = next(s for s in steps(job_b["id"]) if s["status"] == "ready")

    # ================================================================== each worker updates their own task
    def t():
        # an untaken task cannot be updated: take it first
        r = act(A, step_a["id"], "update", {"note": "too early"})
        expect_status(r, 409)
        expect_status(act(A, step_a["id"], "claim"), 200)
        expect_status(act(A, step_a["id"], "start"), 200)
        r = act(A, step_a["id"], "update", {"note": "Plates made, 40 of 100 done"})
        expect_status(r, 200)
        expect_status(act(A, step_a["id"], "update", {"note": "Now 100 of 100, checking"}), 200)
        tl = api("GET", f"/job-cards/{job_a['id']}/timeline", token=A).data
        updates = [e for e in tl if e["action"] == "update"]
        expect(len(updates) == 2 and updates[0]["detail"].startswith("Plates made") and updates[0]["user_name"].startswith("ZZ Worker A"), updates)
        expect(updates[0]["step_id"] == step_a["id"], updates[0])
        return "The worker who took the task writes two progress updates; both sit in the job's trail under their name"
    run("R6U", M_UPD, "A worker writes progress updates on their own task", "Updates saved under their name", t)

    def t():
        expect_status(act(B, step_a["id"], "update", {"note": "I did this"}), 403)
        expect_status(act(A, step_a["id"], "update", {"note": "   "}), 400)
        expect_status(act(A, step_a["id"], "update", {}), 400)
        expect_status(api("POST", f"/job-steps/{step_a['id']}/update", {"note": "x"}), 401)
        # a manager may add one for the worker; accounts may not
        expect_status(act(counter, step_a["id"], "update", {"note": "Supervisor: customer wants it by 5"}), 200)
        expect_status(act(accounts, step_a["id"], "update", {"note": "no"}), 403)
        # a finished task is not "being worked on" only when it never started: a task that is still waiting refuses
        waiting = next((s for s in steps(job_a["id"]) if s["status"] == "waiting"), None)
        expect(waiting is not None, "a waiting step")
        expect_status(act(counter, waiting["id"], "update", {"note": "x"}), 409)
        return "Another worker, an empty note, no sign-in and the accounts role are refused; the supervisor may write one; a waiting task refuses"
    run("R6U", M_UPD, "Updates belong to the person doing the task", "403 / 400 / 401 / 409 as expected", t)

    # B does a task start to finish
    def finish_b():
        expect_status(act(B, step_b["id"], "claim"), 200)
        expect_status(act(B, step_b["id"], "start"), 200)
        expect_status(act(B, step_b["id"], "update", {"note": "Half done"}), 200)
        expect_status(act(B, step_b["id"], "complete", {"note": "All done, packed"}), 200)
    finish_b()

    # ================================================================== the work log
    def t():
        a = api("GET", f"/production/work-log?person_id={ids['a']}&start={today}&end={today}", token=counter)
        expect_status(a, 200)
        d = a.data
        expect(d["person"]["id"] == ids["a"] and d["person"]["name"].startswith("ZZ Worker A"), d["person"])
        mine = [r for r in d["rows"] if r["step_id"] == step_a["id"]]
        expect(len(mine) == 1, [r["step_id"] for r in d["rows"]])
        row = mine[0]
        expect(row["job_number"] == job_a["job_number"] and row["status"] == "in_progress" and row["part"] == "started", row)
        expect(len(row["updates"]) == 2 and row["updates"][0]["text"].startswith("Plates made") and row["started"], row)
        # none of B's work is in A's log
        expect(not any(r["step_id"] == step_b["id"] for r in d["rows"]), "B's task is in A's log")
        expect(d["summary"]["in_progress"] >= 1 and d["summary"]["updates"] >= 2 and d["summary"]["jobs"] >= 1, d["summary"])
        b = api("GET", f"/production/work-log?person_id={ids['b']}&start={today}&end={today}", token=counter).data
        brow = next(r for r in b["rows"] if r["step_id"] == step_b["id"])
        expect(brow["status"] == "done" and brow["part"] == "finished" and brow["note"] == "All done, packed" and brow["finished"] and brow["minutes"] is not None, brow)
        expect(b["summary"]["finished"] == 1 and any(x["section"] for x in b["summary"]["by_section"]) and not any(r["step_id"] == step_a["id"] for r in b["rows"]), b["summary"])
        return "A's log holds only A's task with both updates; B's holds only B's finished task with its note and time taken"
    run("R6L", M_LOG, "The Counter pulls out one person's work on its own", "Only that person's tasks", t)

    def t():
        own = api("GET", f"/production/work-log?start={today}&end={today}", token=A)
        expect_status(own, 200)
        expect("rows" in own.data and own.data["person"]["id"] == ids["a"], own.data.keys())
        expect(any(r["step_id"] == step_a["id"] for r in own.data["rows"]), "own task missing")
        expect_status(api("GET", f"/production/work-log?person_id={ids['b']}", token=A), 403)
        expect_status(api("GET", f"/production/work-log?person_id={ids['a']}", token=A), 200)
        expect_status(api("GET", "/production/work-log"), 401)
        # accounts is not a manager: own (empty) log only
        acc = api("GET", f"/production/work-log?person_id={ids['a']}", token=accounts)
        expect_status(acc, 403)
        return "An employee sees only their own log; asking for a colleague's gives 403; accounts cannot pull out an employee"
    run("R6L", M_LOG, "An employee can only see their own work", "Own log only; 403 for others", t)

    def t():
        team = api("GET", f"/production/work-log?start={today}&end={today}", token=counter)
        expect_status(team, 200)
        rows = {r["id"]: r for r in team.data["team"]}
        expect(ids["a"] in rows and ids["b"] in rows, list(rows))
        expect(rows[ids["b"]]["finished"] == 1 and rows[ids["a"]]["in_progress"] == 1 and rows[ids["a"]]["updates"] >= 2, (rows[ids["a"]], rows[ids["b"]]))
        expect(rows[ids["b"]]["name"].startswith("ZZ Worker B"), rows[ids["b"]])
        return "The team summary shows one line per employee: B finished 1, A has 1 in progress and 2+ updates"
    run("R6L", M_LOG, "The team summary for the Admin / Counter", "One line per employee", t)

    def t():
        # a period in the future has no finished work, but the task still open on A's plate is always shown
        future = (date.today() + timedelta(days=30)).isoformat()
        a = api("GET", f"/production/work-log?person_id={ids['a']}&start={future}&end={future}", token=counter).data
        expect(any(r["step_id"] == step_a["id"] for r in a["rows"]), "open task should always be listed")
        b = api("GET", f"/production/work-log?person_id={ids['b']}&start={future}&end={future}", token=counter).data
        expect(b["rows"] == [] and b["summary"]["finished"] == 0, b["rows"])
        done = api("GET", f"/production/work-log?person_id={ids['a']}&start={today}&end={today}&state=done", token=counter).data
        expect(done["rows"] == [], "state=done should hide the open task")
        opened = api("GET", f"/production/work-log?person_id={ids['a']}&start={today}&end={today}&state=open", token=counter).data
        expect(len(opened["rows"]) == 1, opened["rows"])
        return "Dates narrow the finished work; the task still open is always shown; Finished / Still open filters work"
    run("R6L", M_LOG, "Period and status filters", "Future period empty; open work always listed", t)

    def t():
        status, body, hdr = raw(f"/production/work-log/export?person_id={ids['b']}&start={today}&end={today}", counter)
        expect(status == 200 and body[:2] == b"PK" and "spreadsheet" in hdr["Content-Type"] and "work-log-ZZ-Worker-B" in hdr["Content-Disposition"], (status, hdr.get("Content-Disposition")))
        from io import BytesIO
        from openpyxl import load_workbook
        ws = load_workbook(BytesIO(body)).active
        values = [[c.value for c in row] for row in ws.iter_rows()]
        flat = " ".join(str(v) for row in values for v in row if v is not None)
        expect("Work done by ZZ Worker B" in flat and job_b["job_number"] in flat and "All done, packed" in flat, flat[:200])
        expect(job_a["job_number"] not in flat, "A's job is in B's Excel")
        expect(raw(f"/production/work-log/export?person_id={ids['a']}", B)[0] == 403, "B must not export A's work")
        expect(raw(f"/production/work-log/export?person_id={ids['b']}", B)[0] == 200, "B may export their own")
        return "Excel of one person's work holds only their tasks and notes; a worker can export only their own"
    run("R6L", M_LOG, "Excel download of one person's work", "xlsx with only that person's rows", t)

    # ================================================================== clean up
    for iid in S["invoices"]:
        api("DELETE", f"/invoices/{iid}", token=admin())
    for key in ids.values():
        api("PUT", f"/users/{key}", {"is_active": False}, admin())
