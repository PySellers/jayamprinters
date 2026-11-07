"""Production workflow: work centers, step templates, hand-offs between employees, outside work, board and monitor."""

import uuid
from datetime import date, timedelta

import catalog
from framework import STAFF_PASSWORD, admin, api, as_role, expect, expect_status, run, token_for

TAG = uuid.uuid4().hex[:5]
M_WC = "Work Centers"
M_TPL = "Workflow Templates"
M_FLOW = "Job Workflow"
M_OUT = "Workflow - Outside Work"
M_BOARD = "Workflow - My Work, Board & Monitor"

S = {}
JOBS = []


def login(email):
    return token_for(email, STAFF_PASSWORD)


def ensure_user(name, email, role="production"):
    tok = login(email)
    if tok:
        return
    r = api("POST", "/users/", {"name": name, "email": email, "password": STAFF_PASSWORD, "role": role}, admin())
    expect(r.status in (200, 201, 400), f"could not create {email}: HTTP {r.status}")


def centers():
    return {c["name"]: c for c in api("GET", "/work-centers/", token=admin()).data}


def staff_ids():
    return {u["email"]: u["id"] for u in api("GET", "/users/", token=admin()).data}


def add_member(center_name, email):
    c = centers()[center_name]
    ids = {m["id"] for m in c["members"]} | {staff_ids()[email]}
    r = api("PUT", f"/work-centers/{c['id']}/members", {"user_ids": sorted(ids)}, admin())
    expect_status(r, 200)


def make_job(item=None, delivery_date=None, priority=None, customer=None):
    """An order -> job cards -> returns the job card (as the list shows it)."""
    item = item or catalog.item("Visiting Card", "Visiting Card", 100, [("Finish/Lamination Type", "Without Lamination"), ("Side", "Single Side")])
    q = api("POST", "/quotations/", {"customer_id": customer or S["cust"], "with_gst": False, "is_order": True, "items": [item],
                                    **({"delivery_date": str(delivery_date)} if delivery_date else {})}, admin())
    expect_status(q, 200, 201)
    expect_status(api("POST", f"/quotations/{q.data['id']}/convert", token=admin()), 200, 201)
    jobs = [j for j in api("GET", "/job-cards/", token=admin()).data if j["quotation_item_id"] == q.data["items"][0]["id"]]
    expect(len(jobs) == 1, f"{len(jobs)} job cards")
    job = jobs[0]
    if priority:
        api("PUT", f"/job-cards/{job['id']}", {"priority": priority}, admin())
    JOBS.append(job["id"])
    return job


def steps_of(job_id, token=None):
    r = api("GET", f"/job-cards/{job_id}/steps", token=token or admin())
    expect_status(r, 200)
    return r.data


def step_named(job_id, name, token=None):
    return next(s for s in steps_of(job_id, token) if s["name"] == name)


def job_of(job_id):
    return api("GET", f"/job-cards/{job_id}", token=admin()).data


def act(token, step_id, action, body=None):
    return api("POST", f"/job-steps/{step_id}/{action}", body or {}, token)


def run_all():
    cust = api("POST", "/customers/", {"name": f"ZZTEST Flow {TAG}", "phone": "87" + str(int(TAG, 16)).zfill(8) + "0"}, admin())
    S["cust"] = cust.data["id"]
    for name, email in (("Raja (Printing)", "printer@srijayam.com"), ("Selvam (Binding)", "binder@srijayam.com")):
        ensure_user(name, email)
    add_member("Design", "designer@srijayam.com")
    add_member("Front Desk", "counter@srijayam.com")
    add_member("Printing", "printer@srijayam.com")
    add_member("Finishing & Binding", "binder@srijayam.com")
    tok = {"designer": login("designer@srijayam.com"), "counter": login("counter@srijayam.com"), "printer": login("printer@srijayam.com"),
           "binder": login("binder@srijayam.com"), "accounts": as_role("accounts")}
    for k, v in tok.items():
        expect(v, f"no login for {k}")

    # ------------------------------------------------------------------ work centers
    def t():
        r = api("GET", "/work-centers/", token=tok["printer"])
        expect_status(r, 200)
        names = {c["name"] for c in r.data}
        expect({"Design", "Front Desk", "Printing", "Finishing & Binding", "Xerox Counter", "Outside Vendor"} <= names, names)
        return f"{len(r.data)} work centers visible to every signed-in user"
    run("WCN", M_WC, "List the work centers (any signed-in user)", "Design, Front Desk, Printing, Finishing & Binding, Xerox Counter, Outside Vendor", t)

    def t():
        expect_status(api("GET", "/work-centers/"), 401)
        expect_status(api("GET", "/production/my-work"), 401)
        expect_status(api("GET", "/production/board"), 401)
        expect_status(api("GET", "/job-cards/1/steps"), 401)
        return "401 on every workflow screen without a token"
    run("WCN", M_WC, "Workflow screens need sign-in", "401 without a token", t)

    def t():
        r = api("POST", "/work-centers/", {"name": f"ZZ Cutting {TAG}", "description": "test", "color": "#123456"}, admin())
        expect_status(r, 201)
        S["wc"] = r.data
        expect(r.data["is_active"] and r.data["members"] == [], r.data)
        return f"Work center '{r.data['name']}' created"
    run("WCN", M_WC, "Admin adds a work center", "Created, active, no team yet", t)

    def t():
        expect_status(api("POST", "/work-centers/", {"name": S["wc"]["name"].upper()}, admin()), 400)
        expect_status(api("POST", "/work-centers/", {"name": ""}, admin()), 422)
        return "Same name (any capitals) refused; empty name refused"
    run("WCN", M_WC, "Work center with a name that exists / no name", "Refused", t)

    for role in ("counter", "production", "accounts"):
        def t(role=role):
            expect_status(api("POST", "/work-centers/", {"name": "x"}, as_role(role)), 403)
            expect_status(api("PUT", f"/work-centers/{S['wc']['id']}", {"name": "y"}, as_role(role)), 403)
            expect_status(api("PUT", f"/work-centers/{S['wc']['id']}/members", {"user_ids": []}, as_role(role)), 403)
            expect_status(api("DELETE", f"/work-centers/{S['wc']['id']}", token=as_role(role)), 403)
            return "403 for add, change, team and delete"
        run("WCN", M_WC, f"{role.title()} user tries to manage work centers", "403 (admin only)", t)

    def t():
        r = api("PUT", f"/work-centers/{S['wc']['id']}", {"name": f"ZZ Cutting {TAG} B", "color": "#654321", "is_active": False}, admin())
        expect_status(r, 200)
        expect(r.data["is_active"] is False and r.data["name"].endswith(" B"), r.data)
        api("PUT", f"/work-centers/{S['wc']['id']}", {"is_active": True}, admin())
        return "Renamed, recoloured, switched off and on"
    run("WCN", M_WC, "Admin edits a work center", "Changes saved", t)

    def t():
        uid = staff_ids()["printer@srijayam.com"]
        r = api("PUT", f"/work-centers/{S['wc']['id']}/members", {"user_ids": [uid]}, admin())
        expect_status(r, 200)
        expect([m["id"] for m in r.data["members"]] == [uid], r.data)
        staff = next(u for u in api("GET", "/work-centers/staff", token=tok["counter"]).data if u["id"] == uid)
        expect(S["wc"]["id"] in staff["work_center_ids"], staff)
        expect_status(api("PUT", f"/work-centers/{S['wc']['id']}/members", {"user_ids": [99999999]}, admin()), 404)
        return "Team set; the staff list shows the work center; unknown employee refused"
    run("WCN", M_WC, "Put an employee in a work center", "Team saved; unknown employee refused", t)

    def t():
        r = api("GET", "/work-centers/staff", token=tok["production"] if "production" in tok else tok["printer"])
        expect_status(r, 200)
        expect(all({"id", "name", "role", "work_center_ids"} <= set(u) for u in r.data), "fields missing")
        expect(not any("password" in str(u).lower() for u in r.data), "password leaked")
        return f"{len(r.data)} active employees with their work centers (no passwords)"
    run("WCN", M_WC, "Staff list for the assign boxes", "Names, roles and work centers only", t)

    def t():
        expect_status(api("DELETE", f"/work-centers/{centers()['Printing']['id']}", token=admin()), 400)
        return "A work center used by workflows / jobs cannot be deleted"
    run("WCN", M_WC, "Delete a work center that is in use", "Refused with a clear message", t)

    # ------------------------------------------------------------------ templates
    def t():
        r = api("GET", "/workflow-templates/", token=tok["printer"])
        expect_status(r, 200)
        by = {x["category_name"]: x for x in r.data}
        expect(by["Bill Books & Stationery"]["steps"][0]["name"] == "Design / DTP", by["Bill Books & Stationery"])
        names = [s["name"] for s in by["Bill Books & Stationery"]["steps"]]
        expect(names[-1] == "Handover & delivery" and len(names) == 5, names)
        expect(by["Rubber Stamp"]["steps"][2]["kind"] == "outsource", by["Rubber Stamp"])
        expect(any(x["category_id"] is None for x in r.data), "no default workflow")
        return f"{len(r.data)} workflows; Bill Book: {' > '.join(names)}"
    run("WFT", M_TPL, "Every service has its workflow", "Bill Book 5 steps ending in handover; Rubber Stamp has an outside step", t)

    def t():
        c = api("POST", "/product-categories/", {"name": f"ZZ Flow Service {TAG}", "is_active": True}, admin())
        expect_status(c, 200, 201)
        S["cat"] = c.data["id"]
        p = api("POST", "/products/", {"name": f"ZZ Flow Item {TAG}", "category_id": S["cat"], "pricing_type": "fixed", "fixed_price": 10, "is_active": True}, admin())
        expect_status(p, 200, 201)
        S["prod"] = p.data["id"]
        d = {c["name"]: c["id"] for c in api("GET", "/work-centers/", token=admin()).data}
        S["centers"] = d
        r = api("PUT", f"/workflow-templates/{S['cat']}", {"steps": [
            {"name": "Artwork", "kind": "internal", "stage": "design", "work_center_id": d["Design"]},
            {"name": "Outside lamination", "kind": "outsource", "stage": "binding", "work_center_id": d["Outside Vendor"]},
            {"name": "Pack & hand over", "kind": "internal", "stage": "packing", "work_center_id": d["Front Desk"]},
        ]}, admin())
        expect_status(r, 200)
        mine = next(x for x in r.data if x["category_id"] == S["cat"])
        expect(mine["is_custom"] and [s["name"] for s in mine["steps"]] == ["Artwork", "Outside lamination", "Pack & hand over"], mine)
        return "A service with its own 3-step workflow (one outside step)"
    run("WFT", M_TPL, "Admin sets the workflow of a service", "Saved as the service's own workflow", t)

    def t():
        d = S["centers"]
        for body, code in (({"steps": []}, 422),
                           ({"steps": [{"name": "x", "kind": "magic", "stage": "design"}]}, 400),
                           ({"steps": [{"name": "x", "kind": "internal", "stage": "nowhere"}]}, 400),
                           ({"steps": [{"name": "x", "kind": "internal", "stage": "design", "work_center_id": 99999999}]}, 404),
                           ({"steps": [{"name": "", "kind": "internal", "stage": "design"}]}, 422)):
            expect_status(api("PUT", f"/workflow-templates/{S['cat']}", body, admin()), code)
        expect_status(api("PUT", "/workflow-templates/99999999", {"steps": [{"name": "x", "kind": "internal", "stage": "design"}]}, admin()), 404)
        return "No steps, unknown type, unknown stage, unknown work center, empty name and unknown service are refused"
    run("WFT", M_TPL, "Save a workflow with bad data", "Refused with the right error", t)

    for role in ("counter", "production", "accounts"):
        def t(role=role):
            body = {"steps": [{"name": "x", "kind": "internal", "stage": "design"}]}
            expect_status(api("PUT", f"/workflow-templates/{S['cat']}", body, as_role(role)), 403)
            expect_status(api("PUT", "/workflow-templates/default", body, as_role(role)), 403)
            expect_status(api("DELETE", f"/workflow-templates/{S['cat']}", token=as_role(role)), 403)
            return "403"
        run("WFT", M_TPL, f"{role.title()} user tries to change a workflow", "403 (admin only)", t)

    def t():
        item = dict(product_id=S["prod"], quantity=5, area_sqft=None, sets=1, selected_options=[], extra_charge_ids=[])
        job = make_job(item)
        steps = steps_of(job["id"])
        expect([s["name"] for s in steps] == ["Artwork", "Outside lamination", "Pack & hand over"], [s["name"] for s in steps])
        expect([s["status"] for s in steps] == ["ready", "waiting", "waiting"], [s["status"] for s in steps])
        expect(steps[1]["kind"] == "outsource" and steps[1]["work_center_name"] == "Outside Vendor", steps[1])
        S["old_job"] = job["id"]
        return "A new job of that service gets exactly those steps; only the first is ready"
    run("WFT", M_TPL, "A new job copies the service's workflow", "Same steps, same order, first one ready", t)

    def t():
        d = S["centers"]
        api("PUT", f"/workflow-templates/{S['cat']}", {"steps": [
            {"name": "Artwork", "kind": "internal", "stage": "design", "work_center_id": d["Design"]},
            {"name": "Print", "kind": "internal", "stage": "printing", "work_center_id": d["Printing"]},
        ]}, admin())
        item = dict(product_id=S["prod"], quantity=5, area_sqft=None, sets=1, selected_options=[], extra_charge_ids=[])
        job = make_job(item)
        expect([s["name"] for s in steps_of(job["id"])] == ["Artwork", "Print"], "new job did not use the new workflow")
        expect(len(steps_of(S["old_job"])) == 3, "a running job's steps changed when the workflow was edited")
        return "The new job has 2 steps; the job started earlier keeps its 3"
    run("WFT", M_TPL, "Changing a workflow does not touch running jobs", "Only new jobs use the new steps", t)

    def t():
        r = api("DELETE", f"/workflow-templates/{S['cat']}", token=admin())
        expect_status(r, 200)
        mine = next(x for x in r.data if x["category_id"] == S["cat"])
        expect(mine["is_custom"] is False, mine)
        job = make_job(dict(product_id=S["prod"], quantity=5, area_sqft=None, sets=1, selected_options=[], extra_charge_ids=[]))
        expect(len(steps_of(job["id"])) == 5, "a service with no workflow should use the default 5 steps")
        return "Reset: the service uses the default workflow again (5 steps)"
    run("WFT", M_TPL, "Reset a service to the default workflow", "Back to the default steps", t)

    # ------------------------------------------------------------------ a job through the shop
    def t():
        job = make_job()
        S["job"] = job["id"]
        expect(job["steps_total"] == 5 and job["steps_done"] == 0, job)
        expect(job["current_step"] == "Design / DTP" and job["current_work_center"] == "Design", job)
        expect(job["status"] == "pending", job["status"])
        steps = steps_of(job["id"])
        expect([s["status"] for s in steps] == ["ready", "waiting", "waiting", "waiting", "waiting"], [s["status"] for s in steps])
        expect([s["work_center_name"] for s in steps] == ["Design", "Front Desk", "Printing", "Finishing & Binding", "Front Desk"], [s["work_center_name"] for s in steps])
        return "Order -> job card with 5 steps; Design is ready, the rest wait; the job is still 'pending'"
    run("JWF", M_FLOW, "A new order's job card gets its workflow", "5 steps, first one ready", t)

    def t():
        step = step_named(S["job"], "Design / DTP", tok["printer"])
        expect(step["can_act"] is False, "printer should not be allowed on a Design step")
        expect_status(act(tok["printer"], step["id"], "start"), 403)
        expect_status(act(tok["printer"], step["id"], "complete"), 403)
        d = step_named(S["job"], "Design / DTP", tok["designer"])
        expect(d["can_act"] is True, d)
        return "The printing employee is refused on the Design step; the designer is allowed"
    run("JWF", M_FLOW, "An employee cannot work another team's step", "403 for the wrong team, allowed for the right team", t)

    def t():
        waiting = step_named(S["job"], "Printing")
        for action in ("start", "complete"):
            expect_status(act(tok["printer"], waiting["id"], action), 409)
        expect_status(act(admin(), waiting["id"], "complete"), 409)
        return "A step that has not been handed over yet cannot be started or finished (409)"
    run("JWF", M_FLOW, "Start / finish a step before its turn", "Refused (409)", t)

    def t():
        step = step_named(S["job"], "Design / DTP")
        r = act(tok["designer"], step["id"], "start")
        expect_status(r, 200)
        expect(r.data["status"] == "in_progress" and r.data["assigned_to_name"] and r.data["started_at"], r.data)
        expect(job_of(S["job"])["status"] == "design", job_of(S["job"])["status"])
        expect_status(act(tok["designer"], step["id"], "start"), 200)  # pressing Start twice is harmless
        return "Designer started: step in progress, assigned to the designer, job status 'design'"
    run("JWF", M_FLOW, "Designer starts the design step", "In progress, on the designer; job status design", t)

    def t():
        step = step_named(S["job"], "Design / DTP")
        expect_status(act(tok["binder"], step["id"], "claim"), 403)
        expect_status(act(tok["binder"], step["id"], "assign", {"user_id": staff_ids()["binder@srijayam.com"]}), 403)
        expect_status(act(tok["designer"], step["id"], "assign", {"user_id": staff_ids()["printer@srijayam.com"]}), 403)
        return "Nobody can take over, or hand away, a step that is on someone else"
    run("JWF", M_FLOW, "Take a step that is already on someone else", "Refused (403)", t)

    def t():
        step = step_named(S["job"], "Design / DTP")
        expect_status(api("POST", f"/job-steps/{step['id']}/hold", {"reason": ""}, tok["designer"]), 422)
        r = api("POST", f"/job-steps/{step['id']}/hold", {"reason": "Waiting for the customer's logo"}, tok["designer"])
        expect_status(r, 200)
        expect(r.data["status"] == "on_hold" and "logo" in r.data["hold_reason"], r.data)
        expect_status(act(tok["designer"], step["id"], "complete"), 409)
        expect_status(act(tok["designer"], step["id"], "hold", {"reason": "again"}), 409)
        resumed = act(tok["designer"], step["id"], "start")
        expect_status(resumed, 200)
        expect(resumed.data["status"] == "in_progress" and resumed.data["hold_reason"] is None, resumed.data)
        return "Hold needs a reason, blocks finishing, and Resume clears it"
    run("JWF", M_FLOW, "Put a step on hold and resume it", "Reason required; resume goes back to in progress", t)

    def t():
        step = step_named(S["job"], "Design / DTP")
        r = act(tok["designer"], step["id"], "complete", {"note": "Final artwork in the job folder"})
        expect_status(r, 200)
        expect(r.data["status"] == "done" and r.data["completed_by_name"] and "folder" in r.data["notes"], r.data)
        nxt = step_named(S["job"], "Proof approval")
        expect(nxt["status"] == "ready" and nxt["ready_at"], nxt)
        j = job_of(S["job"])
        expect(j["steps_done"] == 1 and j["current_step"] == "Proof approval" and j["current_work_center"] == "Front Desk", j)
        expect_status(act(tok["designer"], step["id"], "complete"), 409)
        expect_status(act(tok["designer"], step["id"], "start"), 409)
        return "Design finished -> Proof approval is ready for the Front Desk; a finished step cannot be started or finished again"
    run("JWF", M_FLOW, "Designer finishes: the job is handed to the next team", "Next step ready, progress 1/5", t)

    def t():
        step = step_named(S["job"], "Proof approval")
        expect_status(act(tok["printer"], step["id"], "start"), 403)
        expect_status(act(tok["counter"], step["id"], "start"), 200)
        expect_status(act(tok["counter"], step["id"], "complete", {"note": "Customer approved the proof by phone"}), 200)
        return "Front desk approved the proof (the printing employee could not)"
    run("JWF", M_FLOW, "Front desk handles proof approval", "Done by the Front Desk", t)

    def t():
        step = step_named(S["job"], "Printing")
        expect(step["status"] == "ready" and step["assigned_to"] is None, step)
        r = act(tok["printer"], step["id"], "claim")
        expect_status(r, 200)
        expect(r.data["assigned_to_name"] == "Raja (Printing)", r.data)
        expect_status(act(tok["binder"], step["id"], "claim"), 403)
        expect_status(act(tok["printer"], step["id"], "start"), 200)
        expect(job_of(S["job"])["status"] == "printing", job_of(S["job"])["status"])
        expect_status(act(tok["printer"], step["id"], "complete"), 200)
        return "Printer took the step, started and finished it; the job status followed ('printing')"
    run("JWF", M_FLOW, "Printing employee takes the job from the queue and prints it", "Claimed, started, finished", t)

    def t():
        step = step_named(S["job"], "Cutting & lamination")
        expect(step["status"] == "ready", step)
        expect_status(act(tok["printer"], step["id"], "start"), 403)
        expect_status(act(tok["binder"], step["id"], "start"), 200)
        expect(job_of(S["job"])["status"] == "binding", job_of(S["job"])["status"])
        expect_status(act(tok["binder"], step["id"], "complete"), 200)
        return "Finishing & binding employee did the cutting and lamination"
    run("JWF", M_FLOW, "Binding employee finishes the job", "Done by the Finishing & Binding team", t)

    def t():
        step = step_named(S["job"], "Handover & delivery")
        expect(step["status"] == "ready", step)
        expect_status(act(tok["binder"], step["id"], "start"), 403)
        expect_status(act(tok["counter"], step["id"], "complete", {"note": "Handed to the customer"}), 200)
        j = job_of(S["job"])
        expect(j["status"] == "delivered" and j["steps_done"] == 5 and j["delivered_at"] and j["current_step"] is None, j)
        return "Front desk handed it over: every step done, job 'delivered' with a delivery time"
    run("JWF", M_FLOW, "Front desk hands over: the order is delivered automatically", "Job status delivered, delivered_at set", t)

    def t():
        ev = api("GET", f"/job-cards/{S['job']}/timeline", token=tok["printer"]).data
        actions = [e["action"] for e in ev]
        expect(actions[0] == "created" and actions[-1] == "delivered", actions)
        for a in ("started", "completed", "handoff", "on_hold", "resumed"):
            expect(a in actions, f"{a} missing from {actions}")
        expect(any(e["user_name"] == "Raja (Printing)" for e in ev), "the printer's name is not in the trail")
        expect(any(e["step_name"] == "Printing" for e in ev), "step names missing")
        return f"{len(ev)} events in order: " + ", ".join(actions[:8]) + " ..."
    run("JWF", M_FLOW, "The activity trail records who did what, in order", "created ... delivered with names and steps", t)

    def t():
        expect_status(api("GET", "/job-cards/99999999/steps", token=admin()), 404)
        expect_status(api("GET", "/job-cards/99999999/timeline", token=admin()), 404)
        expect_status(act(admin(), 99999999, "start"), 404)
        return "Unknown job / step -> 404"
    run("JWF", M_FLOW, "Steps of a job that does not exist", "404", t)

    # ------------------------------------------------------------------ supervisor controls
    def t():
        job = make_job()
        S["job2"] = job["id"]
        steps = steps_of(job["id"])
        design = steps[0]
        uid = staff_ids()["designer@srijayam.com"]
        expect_status(act(tok["printer"], design["id"], "assign", {"user_id": uid}), 403)
        r = act(tok["counter"], design["id"], "assign", {"user_id": uid})
        expect_status(r, 200)
        expect(r.data["assigned_to"] == uid, r.data)
        expect_status(act(tok["counter"], design["id"], "assign", {"user_id": 99999999}), 404)
        r = act(tok["counter"], design["id"], "assign", {"user_id": None})
        expect(r.data["assigned_to"] is None, r.data)
        expect_status(act(tok["designer"], design["id"], "assign", {"user_id": None}), 403)
        return "Supervisor assigns and un-assigns; staff cannot; unknown employee refused"
    run("JWF", M_FLOW, "Supervisor assigns a step to an employee", "Assigned / un-assigned; 403 for staff", t)

    def t():
        steps = steps_of(S["job2"])
        printing = next(s for s in steps if s["name"] == "Printing")
        expect_status(act(tok["printer"], printing["id"], "skip"), 403)
        r = act(tok["counter"], printing["id"], "skip", {"note": "Reprint of an old job"})
        expect_status(r, 200)
        expect(r.data["status"] == "skipped", r.data)
        j = job_of(S["job2"])
        expect(j["steps_total"] == 4, j)
        expect_status(act(tok["counter"], printing["id"], "skip"), 409)
        return "Counter skipped the Printing step (staff cannot); the job now has 4 steps to do"
    run("JWF", M_FLOW, "Skip a step that is not needed", "Skipped by a supervisor only; progress recalculated", t)

    def t():
        job = make_job()
        design = steps_of(job["id"])[0]
        act(admin(), design["id"], "start")
        act(admin(), design["id"], "complete")
        prop = step_named(job["id"], "Proof approval")
        act(admin(), prop["id"], "start")
        expect(job_of(job["id"])["status"] == "approval", job_of(job["id"])["status"])
        expect_status(act(tok["designer"], design["id"], "reopen"), 403)
        r = act(tok["counter"], design["id"], "reopen", {"note": "Customer wants changes"})
        expect_status(r, 200)
        expect(r.data["status"] == "in_progress", r.data)
        expect(step_named(job["id"], "Proof approval")["status"] == "waiting", "later step should wait again")
        expect(job_of(job["id"])["status"] == "design", job_of(job["id"])["status"])
        expect_status(act(admin(), step_named(job["id"], "Printing")["id"], "reopen"), 409)
        return "Re-opened Design: Proof approval waits again, the job is back in 'design'; staff cannot re-open"
    run("JWF", M_FLOW, "Re-open a finished step (customer wants changes)", "Step back in progress, later steps wait again", t)

    def t():
        job = make_job()
        for s in steps_of(job["id"]):
            for action in ("start", "complete"):
                expect_status(act(admin(), s["id"], action), 200)
        expect(job_of(job["id"])["status"] == "delivered", "should be delivered")
        last = step_named(job["id"], "Handover & delivery")
        expect_status(act(tok["counter"], last["id"], "reopen"), 200)
        j = job_of(job["id"])
        expect(j["status"] != "delivered" and j["delivered_at"] is None, j)
        expect_status(act(tok["counter"], last["id"], "complete"), 200)
        expect(job_of(job["id"])["status"] == "delivered", "should be delivered again")
        return "Re-opening the last step of a delivered job takes it out of 'delivered'; finishing again delivers it"
    run("JWF", M_FLOW, "Re-open a delivered job's last step", "No longer delivered until finished again", t)

    def t():
        job = make_job()
        S["job3"] = job["id"]
        steps = steps_of(job["id"])
        expect_status(api("POST", f"/job-cards/{job['id']}/steps", {"name": "Foil stamping", "kind": "outsource"}, tok["printer"]), 403)
        r = api("POST", f"/job-cards/{job['id']}/steps", {"name": "Foil stamping", "work_center_id": S["centers"]["Finishing & Binding"]}, tok["counter"])
        expect_status(r, 201)
        names = [s["name"] for s in r.data]
        expect(names.index("Foil stamping") == len(names) - 2 and names[-1] == "Handover & delivery", names)
        expect([s["position"] for s in r.data] == list(range(1, len(names) + 1)), "positions not 1..n")
        expect(len(names) == len(steps) + 1, names)
        expect_status(api("POST", f"/job-cards/{job['id']}/steps", {"name": "  "}, tok["counter"]), 400)
        expect_status(api("POST", f"/job-cards/{job['id']}/steps", {"name": "x", "kind": "magic"}, tok["counter"]), 400)
        expect_status(api("POST", f"/job-cards/{job['id']}/steps", {"name": "x", "work_center_id": 99999999}, tok["counter"]), 404)
        return "Counter added 'Foil stamping' before the hand-over step; staff cannot; bad input refused"
    run("JWF", M_FLOW, "Add an extra step to one job", "Inserted before the handover; positions renumbered", t)

    def t():
        steps = steps_of(S["job3"])
        foil = next(s for s in steps if s["name"] == "Foil stamping")
        r = api("PUT", f"/job-steps/{foil['id']}", {"name": "Gold foil stamping", "due_date": str(date.today() + timedelta(days=2)), "notes": "Gold"}, tok["counter"])
        expect_status(r, 200)
        expect(r.data["name"] == "Gold foil stamping" and r.data["notes"] == "Gold" and r.data["due_date"], r.data)
        expect_status(api("PUT", f"/job-steps/{foil['id']}", {"name": ""}, tok["counter"]), 400)
        expect_status(api("PUT", f"/job-steps/{foil['id']}", {"name": "x"}, tok["printer"]), 403)
        r = act(tok["counter"], foil["id"], "move", {"direction": "up"})
        expect_status(r, 200)
        after = steps_of(S["job3"])
        expect([s["name"] for s in after].index("Gold foil stamping") == [s["name"] for s in steps].index("Foil stamping") - 1, [s["name"] for s in after])
        expect_status(act(tok["counter"], foil["id"], "move", {"direction": "sideways"}), 422)
        return "Renamed, dated, noted and moved up one place; staff cannot edit; blank name refused"
    run("JWF", M_FLOW, "Edit and re-order a step", "Saved; order changes", t)

    def t():
        steps = steps_of(S["job3"])
        foil = next(s for s in steps if s["name"] == "Gold foil stamping")
        expect_status(api("DELETE", f"/job-steps/{foil['id']}", token=tok["printer"]), 403)
        expect_status(api("DELETE", f"/job-steps/{foil['id']}", token=tok["counter"]), 204)
        after = steps_of(S["job3"])
        expect(len(after) == len(steps) - 1 and [s["position"] for s in after] == list(range(1, len(after) + 1)), "not renumbered")
        design = after[0]
        act(admin(), design["id"], "start")
        expect_status(api("DELETE", f"/job-steps/{design['id']}", token=admin()), 409)
        return "A waiting step can be deleted by a supervisor; a started step cannot (skip it instead)"
    run("JWF", M_FLOW, "Delete a step", "Allowed only for steps not started", t)

    # ------------------------------------------------------------------ old status box still works
    def t():
        job = make_job()
        r = api("PATCH", f"/job-cards/{job['id']}/status", {"status": "printing"}, as_role("production"))
        expect_status(r, 200)
        steps = steps_of(job["id"])
        by = {s["name"]: s["status"] for s in steps}
        expect(by["Design / DTP"] == "done" and by["Proof approval"] == "done" and by["Printing"] == "in_progress" and by["Handover & delivery"] == "waiting", by)
        expect(r.data["status"] == "printing", r.data)
        r = api("PATCH", f"/job-cards/{job['id']}/status", {"status": "delivered"}, as_role("production"))
        expect(r.data["status"] == "delivered" and all(s["status"] == "done" for s in steps_of(job["id"])), r.data)
        r = api("PATCH", f"/job-cards/{job['id']}/status", {"status": "pending"}, as_role("production"))
        expect(r.data["status"] == "pending" and steps_of(job["id"])[0]["status"] == "ready", r.data)
        expect_status(api("PATCH", f"/job-cards/{job['id']}/status", {"status": "nonsense"}, admin()), 422)
        return "Setting the status on the job list moves the steps to match (printing / delivered / pending)"
    run("JWF", M_FLOW, "The status box on the job list keeps the steps in step", "Steps follow the status", t)

    def t():
        job = make_job()
        uid = staff_ids()["designer@srijayam.com"]
        oid = staff_ids()["printer@srijayam.com"]
        r = api("PUT", f"/job-cards/{job['id']}", {"designer_id": uid, "operator_id": oid}, admin())
        expect_status(r, 200)
        by = {s["name"]: s["assigned_to"] for s in steps_of(job["id"])}
        expect(by["Design / DTP"] == uid and by["Printing"] == oid, by)
        return "Choosing a designer / operator on the job card also puts them on the design / printing step"
    run("JWF", M_FLOW, "Designer / operator boxes put people on the steps", "Design step on the designer, printing step on the operator", t)

    def t():
        item = catalog.item("Visiting Card", "Visiting Card", 100, [("Finish/Lamination Type", "Without Lamination"), ("Side", "Single Side")])
        r = api("POST", "/job-cards/", {"customer_id": S["cust"], "product_id": item["product_id"], "priority": "urgent"}, tok["counter"])
        expect_status(r, 201)
        JOBS.append(r.data["id"])
        expect(r.data["steps_total"] == 5 and r.data["current_step"], r.data)
        return "A job card created by hand also gets its steps"
    run("JWF", M_FLOW, "A job card created directly gets its workflow", "5 steps", t)

    def t():
        job = make_job()
        expect_status(api("DELETE", f"/job-cards/{job['id']}", token=admin()), 204)
        JOBS.remove(job["id"])
        expect_status(api("GET", f"/job-cards/{job['id']}/steps", token=admin()), 404)
        return "Deleting a job card removes its steps and trail"
    run("JWF", M_FLOW, "Delete a job card", "Steps go with it, no error", t)

    # ------------------------------------------------------------------ outside work
    def t():
        d = S["centers"]
        api("PUT", f"/workflow-templates/{S['cat']}", {"steps": [
            {"name": "Artwork", "kind": "internal", "stage": "design", "work_center_id": d["Design"]},
            {"name": "Outside lamination", "kind": "outsource", "stage": "binding", "work_center_id": d["Outside Vendor"]},
            {"name": "Pack & hand over", "kind": "internal", "stage": "packing", "work_center_id": d["Front Desk"]},
        ]}, admin())
        item = dict(product_id=S["prod"], quantity=40, area_sqft=None, sets=1, selected_options=[], extra_charge_ids=[])
        job = make_job(item)
        S["out_job"] = job["id"]
        design = steps_of(job["id"])[0]
        act(admin(), design["id"], "start")
        act(admin(), design["id"], "complete")
        out = step_named(job["id"], "Outside lamination")
        expect(out["status"] == "ready" and out["kind"] == "outsource", out)
        S["out_step"] = out["id"]
        return "A job with an outside step is waiting at that step"
    run("OSW", M_OUT, "A job reaches its outside-company step", "Outside step is ready", t)

    def t():
        sid = S["out_step"]
        expect_status(api("POST", f"/job-steps/{sid}/send-out", {"cost_amount": 100}, admin()), 400)
        expect_status(api("POST", f"/job-steps/{sid}/send-out", {"vendor_name": "x", "cost_amount": -1}, admin()), 422)
        expect_status(api("POST", f"/job-steps/{sid}/send-out", {"vendor_name": "ZZTEST Press", "cost_amount": 100}, tok["printer"]), 403)
        r = api("POST", f"/job-steps/{sid}/send-out", {"vendor_name": f"ZZTEST Press {TAG}", "cost_amount": 600, "customer_price": 900,
                                                          "expected_date": str(date.today() + timedelta(days=2)), "description": "Matt lamination"}, tok["counter"])
        expect_status(r, 200)
        expect(r.data["status"] == "in_progress" and r.data["outsource_job_number"].startswith("OS-") and r.data["outsource_vendor"], r.data)
        S["os_id"] = r.data["outsource_job_id"]
        os_job = api("GET", f"/outsource/{S['os_id']}", token=admin()).data
        expect(os_job["job_card_id"] == S["out_job"] and os_job["cost_amount"] == 600 and os_job["margin"] == 300 and os_job["status"] == "sent", os_job)
        expect(os_job["customer_id"] == S["cust"] and os_job["quantity"] == 40 and "Outside lamination" in os_job["service"], os_job)
        expect_status(api("POST", f"/job-steps/{sid}/send-out", {"vendor_name": "again", "cost_amount": 1}, admin()), 409)
        return f"Sent out as {r.data['outsource_job_number']}: linked Outsource job, cost Rs600, margin Rs300, step in progress"
    run("OSW", M_OUT, "Send the step to an outside company", "Outsource job created and linked; sending twice refused", t)

    def t():
        r = api("PUT", f"/outsource/{S['os_id']}", {"status": "received"}, tok["counter"])
        expect_status(r, 200)
        out = step_named(S["out_job"], "Outside lamination")
        expect(out["status"] == "done", out)
        nxt = step_named(S["out_job"], "Pack & hand over")
        expect(nxt["status"] == "ready", nxt)
        ev = [e["action"] for e in api("GET", f"/job-cards/{S['out_job']}/timeline", token=admin()).data]
        expect("sent_out" in ev and ev.count("handoff") >= 2, ev)
        return "Marking the Outsource job 'received' finished the step and handed the job to the Front Desk"
    run("OSW", M_OUT, "Outside work comes back: the step finishes by itself", "Step done, next step ready", t)

    def t():
        job = make_job(dict(product_id=S["prod"], quantity=5, area_sqft=None, sets=1, selected_options=[], extra_charge_ids=[]))
        d = steps_of(job["id"])[0]
        act(admin(), d["id"], "start")
        act(admin(), d["id"], "complete")
        out = step_named(job["id"], "Outside lamination")
        r = api("POST", f"/job-steps/{out['id']}/send-out", {"vendor_name": f"ZZTEST Press {TAG}", "cost_amount": 50}, admin())
        os_id = r.data["outsource_job_id"]
        expect_status(api("PUT", f"/outsource/{os_id}", {"status": "cancelled"}, admin()), 200)
        held = step_named(job["id"], "Outside lamination")
        expect(held["status"] == "on_hold" and "cancelled" in held["hold_reason"], held)
        again = api("POST", f"/job-steps/{out['id']}/send-out", {"vendor_name": "Another Press", "cost_amount": 70}, admin())
        expect_status(again, 200)
        return "Cancelling the Outsource job puts the step on hold; it can be sent to another company"
    run("OSW", M_OUT, "Outside job cancelled", "Step on hold, can be re-sent", t)

    def t():
        job = make_job(dict(product_id=S["prod"], quantity=5, area_sqft=None, sets=1, selected_options=[], extra_charge_ids=[]))
        d = steps_of(job["id"])[0]
        act(admin(), d["id"], "start")
        act(admin(), d["id"], "complete")
        out = step_named(job["id"], "Outside lamination")
        r = api("POST", f"/job-steps/{out['id']}/send-out", {"vendor_name": f"ZZTEST Press {TAG}", "cost_amount": 50}, admin())
        os_id = r.data["outsource_job_id"]
        expect_status(act(admin(), out["id"], "complete", {"note": "Collected from the press"}), 200)
        o = api("GET", f"/outsource/{os_id}", token=admin()).data
        expect(o["status"] == "received" and o["received_date"], o)
        return "Finishing the step by hand also marks the Outsource job received"
    run("OSW", M_OUT, "Finish an outside step by hand", "Outsource job marked received", t)

    def t():
        job = make_job()
        plain = steps_of(job["id"])[0]
        expect_status(api("POST", f"/job-steps/{plain['id']}/send-out", {"vendor_name": "x", "cost_amount": 1}, admin()), 400)
        return "Only an outside-company step can be sent out"
    run("OSW", M_OUT, "Send out a step that is done in the shop", "Refused (400)", t)

    # ------------------------------------------------------------------ my work, board, monitor
    def t():
        job = make_job(priority="urgent")
        S["mw"] = job["id"]
        mine = api("GET", "/production/my-work", token=tok["designer"]).data
        expect_status(api("GET", "/production/my-work", token=tok["designer"]), 200)
        expect("Design" in mine["work_centers"], mine["work_centers"])
        ids = [c["job_card_id"] for c in mine["queue"]]
        expect(job["id"] in ids, "the new job is not in the design queue")
        expect(job["id"] not in [c["job_card_id"] for c in mine["mine"]], "not assigned yet")
        first = mine["queue"][0]
        expect(first["priority"] == "urgent", f"urgent jobs should come first, got {first['priority']}")
        card = next(c for c in mine["queue"] if c["job_card_id"] == job["id"])
        expect(card["customer_name"] and card["product_name"] and card["steps_total"] == 5 and card["can_act"], card)
        expect(mine["count"] == len(mine["mine"]) + len(mine["queue"]), mine["count"])
        printer = api("GET", "/production/my-work", token=tok["printer"]).data
        expect(job["id"] not in [c["job_card_id"] for c in printer["queue"]], "the printer must not see Design work")
        return f"The designer sees the new urgent job first in the Design queue ({mine['count']} open); the printer does not"
    run("MYW", M_BOARD, "My Work shows my team's queue, urgent first", "New job in the Design queue only", t)

    def t():
        step = step_named(S["mw"], "Design / DTP")
        act(tok["designer"], step["id"], "claim")
        mine = api("GET", "/production/my-work", token=tok["designer"]).data
        expect(S["mw"] in [c["job_card_id"] for c in mine["mine"]], "claimed job missing from 'on me'")
        expect(S["mw"] not in [c["job_card_id"] for c in mine["queue"]], "claimed job still in the queue")
        other = api("GET", "/production/my-work", token=tok["accounts"]).data
        expect(other["work_centers"] == [] or S["mw"] not in [c["job_card_id"] for c in other["queue"]], "someone outside the team sees the queue")
        return "Claimed work moves from the queue to 'on me'; people outside the team do not see it"
    run("MYW", M_BOARD, "Taking a job moves it to 'on me'", "Moves between lists", t)

    def t():
        r = api("GET", "/production/board", token=tok["printer"])
        expect_status(r, 200)
        cols = {c["name"]: c for c in r.data["columns"]}
        expect({"Design", "Front Desk", "Printing"} <= set(cols), list(cols))
        expect(any(c["job_card_id"] == S["mw"] for c in cols["Design"]["cards"]), "job not on the Design column")
        total_cards = sum(len(c["cards"]) for c in r.data["columns"])
        urgent = api("GET", "/production/board?urgent=true", token=admin()).data
        urgent_cards = [c for col in urgent["columns"] for c in col["cards"]]
        expect(urgent_cards and all(c["priority"] in ("urgent", "high") for c in urgent_cards), "urgent filter let other priorities through")
        expect(len(urgent_cards) <= total_cards, "filter returned more than the whole board")
        late = api("GET", "/production/board?overdue=true", token=admin()).data
        expect(all(c["overdue"] for col in late["columns"] for c in col["cards"]), "overdue filter let a job through that is not late")
        one = api("GET", f"/production/board?work_center_id={S['centers']['Printing']}", token=admin()).data
        expect(all(c["work_center_id"] == S["centers"]["Printing"] for col in one["columns"] for c in col["cards"]), "work center filter")
        return f"Board: {len(cols)} columns, {total_cards} open pieces of work; urgent / overdue / work-center filters behave"
    run("MYW", M_BOARD, "The production board, with filters", "A column per work center; filters narrow it", t)

    def t():
        past = date.today() - timedelta(days=3)
        job = make_job(delivery_date=past)
        expect(job["overdue"] is True, job)
        r = api("GET", "/production/board?overdue=true", token=admin()).data
        expect(job["id"] in [c["job_card_id"] for col in r["columns"] for c in col["cards"]], "overdue job not on the overdue board")
        done = make_job(delivery_date=past)
        api("PATCH", f"/job-cards/{done['id']}/status", {"status": "delivered"}, admin())
        expect(job_of(done["id"])["overdue"] is False, "a delivered job is never overdue")
        return "A job past its delivery date is flagged overdue; once delivered it is not"
    run("MYW", M_BOARD, "Overdue jobs are flagged", "Overdue until delivered", t)

    def t():
        expect_status(api("GET", "/production/summary", token=as_role("production")), 403)
        for who in (admin(), tok["counter"], tok["accounts"]):
            expect_status(api("GET", "/production/summary", token=who), 200)
        d = api("GET", "/production/summary", token=admin()).data
        for key in ("open_jobs", "overdue_jobs", "due_today", "urgent_jobs", "delivered_today", "on_hold_steps", "by_work_center", "by_employee",
                    "waiting_longest", "outside_work", "on_hold", "overdue", "trend"):
            expect(key in d, f"{key} missing")
        expect(len(d["trend"]) == 7, "7-day trend expected")
        expect(d["overdue_jobs"] >= 1 and d["urgent_jobs"] >= 1, d)
        board = api("GET", "/production/board", token=admin()).data
        board_cards = sum(len(c["cards"]) for c in board["columns"])
        monitor_open = sum(w["ready"] + w["in_progress"] + w["on_hold"] for w in d["by_work_center"])
        expect(board_cards == monitor_open, f"board shows {board_cards} open pieces of work, monitor says {monitor_open}")
        return f"{d['open_jobs']} open orders, {d['overdue_jobs']} overdue; board ({board_cards}) agrees with the monitor ({monitor_open})"
    run("MYW", M_BOARD, "Monitor figures", "All figures present; admin / counter / accounts only; matches the board", t)

    def t():
        d = api("GET", "/production/summary", token=admin()).data
        names = {e["name"] for e in d["by_employee"]}
        expect(d["by_employee"], "no employees listed")
        for e in d["by_employee"]:
            expect(all(isinstance(e[k], int) and e[k] >= 0 for k in ("in_progress", "assigned_waiting", "on_hold", "done_today", "done_week")), e)
        expect(any(e["done_week"] > 0 for e in d["by_employee"]), "nobody has finished anything this week?")
        return f"{len(d['by_employee'])} employees listed with their workload"
    run("MYW", M_BOARD, "Workload per employee", "Counts per employee, never negative", t)

    def t():
        job = make_job()
        d = steps_of(job["id"])[0]
        act(admin(), d["id"], "start")
        act(admin(), d["id"], "hold", {"reason": "ZZTEST waiting for paper"})
        s = api("GET", "/production/summary", token=admin()).data
        expect(any(h["job_card_id"] == job["id"] and "paper" in h["reason"] for h in s["on_hold"]), "held job missing from the monitor")
        expect(s["on_hold_steps"] >= 1, s["on_hold_steps"])
        return "A job on hold appears in the monitor with its reason"
    run("MYW", M_BOARD, "Held jobs show in the monitor", "Listed with the reason", t)

    def t():
        s = api("GET", "/production/summary", token=admin()).data
        job = make_job(dict(product_id=S["prod"], quantity=5, area_sqft=None, sets=1, selected_options=[], extra_charge_ids=[]))
        d = steps_of(job["id"])[0]
        act(admin(), d["id"], "start")
        act(admin(), d["id"], "complete")
        out = step_named(job["id"], "Outside lamination")
        r = api("POST", f"/job-steps/{out['id']}/send-out", {"vendor_name": f"ZZTEST Late Press {TAG}", "cost_amount": 10,
                                                              "expected_date": str(date.today() - timedelta(days=1))}, admin())
        expect_status(r, 200)
        s = api("GET", "/production/summary", token=admin()).data
        row = next(o for o in s["outside_work"] if o["id"] == r.data["outsource_job_id"])
        expect(row["late"] is True and row["job_card_id"] == job["id"], row)
        return "Work out with an outside company shows in the monitor, flagged late when it is past its date"
    run("MYW", M_BOARD, "Outside work shows in the monitor", "Listed, late flag when past its date", t)

    def t():
        s = api("GET", "/production/summary", token=admin()).data
        wc = next(w for w in s["by_work_center"] if w["name"] == "Design")
        expect(wc["done_today"] >= 1, wc)
        today = s["trend"][-1]
        expect(today["steps_done"] >= 1, today)
        expect(s["delivered_today"] >= 1, s["delivered_today"])
        return f"Today: {today['steps_done']} steps finished, {s['delivered_today']} orders delivered"
    run("MYW", M_BOARD, "Today's finished work is counted", "Finished steps and deliveries counted today", t)

    # ------------------------------------------------------------------ the job list
    def t():
        jobs = api("GET", "/job-cards/", token=admin()).data
        j = next(x for x in jobs if x["id"] == S["job"])
        expect(j["status"] == "delivered" and j["steps_done"] == j["steps_total"] == 5 and j["delivered_at"], j)
        sample = next(x for x in jobs if x["id"] == S["job3"])
        expect(sample["steps_total"] >= 5 and sample["current_step"], sample)
        return "The job list shows progress (steps done / total), the current step and who has it"
    run("MYW", M_BOARD, "Job list shows progress", "steps_done / steps_total, current step, current person", t)

    # ------------------------------------------------------------------ clean-up
    def t():
        for jid in list(JOBS):
            api("DELETE", f"/job-cards/{jid}", token=admin())
        if S.get("cat"):
            api("DELETE", f"/workflow-templates/{S['cat']}", token=admin())
        if S.get("prod"):
            api("DELETE", f"/products/{S['prod']}", token=admin())
        if S.get("cat"):
            api("DELETE", f"/product-categories/{S['cat']}", token=admin())
        if S.get("wc"):
            expect_status(api("DELETE", f"/work-centers/{S['wc']['id']}", token=admin()), 204)
        return "Test records removed"
    run("WFL", "Clean-up", "Remove the records created by the workflow tests", "Removed", t)
