"""Authentication, users & roles, customers, taxes and the machine / printing-type masters."""

import uuid

from framework import admin, api, as_role, expect, expect_status, run, token_for, ADMIN

TAG = uuid.uuid4().hex[:6]
PH = str(int(TAG, 16)).zfill(8)  # unique digits for phone numbers


def run_all():
    # ------------------------------------------------------------------ AUTH
    M = "Login & Security"

    def t():
        r = api("POST", "/auth/login", {"email": ADMIN[0], "password": ADMIN[1]})
        expect_status(r, 200)
        expect(r.data.get("access_token"), "no token returned")
        expect(r.data["user"]["role"] == "admin", "user role missing")
        return f"Token issued for {r.data['user']['email']} (role admin)"
    run("AUTH", M, "Admin signs in with the correct e-mail and password", "200 OK with an access token and the user's role", t)

    def t():
        r = api("POST", "/auth/login", {"email": ADMIN[0], "password": "wrong-password"})
        expect_status(r, 401)
        return "401 'Incorrect email or password'"
    run("AUTH", M, "Sign-in with a wrong password", "Rejected with 401, no token", t)

    def t():
        r = api("POST", "/auth/login", {"email": "nobody@nowhere.com", "password": "x"})
        expect_status(r, 401)
        return "401 returned"
    run("AUTH", M, "Sign-in with an e-mail that does not exist", "Rejected with 401", t)

    def t():
        r = api("POST", "/auth/login", {})
        expect_status(r, 422)
        return "422 validation error"
    run("AUTH", M, "Sign-in with an empty form", "Rejected with a validation error (422)", t)

    def t():
        r = api("POST", "/auth/login", {"email": "not-an-email", "password": "x"})
        expect_status(r, 422)
        return "422 validation error"
    run("AUTH", M, "Sign-in with a malformed e-mail address", "Rejected with a validation error (422)", t)

    def t():
        r = api("GET", "/auth/me", token=admin())
        expect_status(r, 200)
        expect(r.data["email"] == ADMIN[0], "wrong user")
        return f"Returned profile of {r.data['email']}"
    run("AUTH", M, "Fetch my profile with a valid token", "200 with the signed-in user's profile", t)

    def t():
        r = api("GET", "/auth/me")
        expect_status(r, 401)
        return "401 returned"
    run("AUTH", M, "Open a protected page without signing in", "401 Not authenticated", t)

    def t():
        r = api("GET", "/customers/", token="this.is.not.a.token")
        expect_status(r, 401)
        return "401 returned"
    run("AUTH", M, "Use a forged / invalid token", "401 Unauthorized", t)

    for role, email in (("counter", "counter@srijayam.com"), ("production", "designer@srijayam.com"),
                        ("production", "operator@srijayam.com"), ("accounts", "accounts@srijayam.com")):
        def t(email=email, role=role):
            r = api("POST", "/auth/login", {"email": email, "password": "Uat@12345"})
            expect_status(r, 200)
            expect(r.data["user"]["role"] == role, f"role is {r.data['user']['role']}")
            return f"{email} signed in as {role}"
        run("AUTH", M, f"Staff login works for {email}", f"200 and role = {role}", t)

    # ------------------------------------------------------------------ USERS
    M = "Users & Roles"
    created = {}

    def t():
        r = api("POST", "/users/", {"name": f"Test User {TAG}", "email": f"t{TAG}@example.com", "password": "Temp@1234", "role": "counter"}, admin())
        expect_status(r, 201)
        created["id"] = r.data["id"]
        expect(r.data["role"] == "counter", "role not saved")
        expect("password" not in r.data and "hashed_password" not in r.data, "password leaked in response")
        return f"User #{r.data['id']} created; password not returned"
    run("USR", M, "Admin creates a new Counter user", "201 Created, role saved, password never shown", t)

    def t():
        r = api("POST", "/users/", {"name": "Dup", "email": f"t{TAG}@example.com", "password": "Temp@1234", "role": "counter"}, admin())
        expect_status(r, 400)
        return "400 'A user with this email already exists'"
    run("USR", M, "Create a user with an e-mail that is already used", "Rejected with 400 (duplicate e-mail)", t)

    def t():
        r = api("POST", "/users/", {"name": "NoPass", "email": f"np{TAG}@example.com", "role": "counter"}, admin())
        expect_status(r, 422)
        return "422 validation error"
    run("USR", M, "Create a user without a password", "Rejected with 422", t)

    def t():
        r = api("GET", "/users/", token=admin())
        expect_status(r, 200)
        expect(any(u["id"] == created["id"] for u in r.data), "new user not in list")
        return f"{len(r.data)} users listed, new user present"
    run("USR", M, "Admin lists all users", "200 with the new user in the list", t)

    def t():
        r = api("GET", f"/users/{created['id']}", token=admin())
        expect_status(r, 200)
        return "Single user returned"
    run("USR", M, "Admin opens a single user", "200 with the user", t)

    def t():
        r = api("GET", "/users/999999", token=admin())
        expect_status(r, 404)
        return "404 returned"
    run("USR", M, "Open a user that does not exist", "404 Not Found", t)

    def t():
        r = api("PATCH", f"/users/{created['id']}", {"name": f"Renamed {TAG}", "role": "accounts"}, admin())
        expect_status(r, 200)
        expect(r.data["role"] == "accounts" and r.data["name"].startswith("Renamed"), "update not saved")
        return "Name and role changed to accounts"
    run("USR", M, "Admin changes a user's name and role", "200 and both fields updated", t)

    def t():
        r = api("PATCH", f"/users/{created['id']}", {"password": "NewPass@999"}, admin())
        expect_status(r, 200)
        ok = api("POST", "/auth/login", {"email": f"t{TAG}@example.com", "password": "NewPass@999"})
        old = api("POST", "/auth/login", {"email": f"t{TAG}@example.com", "password": "Temp@1234"})
        expect_status(ok, 200)
        expect_status(old, 401)
        return "New password works, old password rejected"
    run("USR", M, "Admin resets a user's password", "New password signs in, old one is refused", t)

    def t():
        r = api("PATCH", f"/users/{created['id']}", {"is_active": False}, admin())
        expect_status(r, 200)
        login = api("POST", "/auth/login", {"email": f"t{TAG}@example.com", "password": "NewPass@999"})
        expect(login.status in (400, 401, 403), f"deactivated user could still sign in (HTTP {login.status})")
        return f"Deactivated user is refused (HTTP {login.status})"
    run("USR", M, "Deactivated user tries to sign in", "Sign-in refused", t)

    for role in ("counter", "production", "accounts"):
        def t(role=role):
            r = api("GET", "/users/", token=as_role(role))
            expect_status(r, 403)
            return "403 Forbidden"
        run("USR", M, f"{role.title()} user tries to open the Users list", "403 Forbidden (admin only)", t)

    def t():
        r = api("POST", "/users/", {"name": "x", "email": f"x{TAG}@example.com", "password": "Temp@1234", "role": "admin"}, as_role("counter"))
        expect_status(r, 403)
        return "403 - a counter user cannot create an admin"
    run("USR", M, "Counter tries to create an admin account (privilege escalation)", "403 Forbidden", t)

    def t():
        r = api("DELETE", f"/users/{created['id']}", token=admin())
        expect_status(r, 200, 204)
        g = api("GET", f"/users/{created['id']}", token=admin())
        expect_status(g, 404)
        return "User deleted and no longer found"
    run("USR", M, "Admin deletes a user", "Deleted; a later lookup gives 404", t)

    # ------------------------------------------------------------------ CUSTOMERS
    M = "Customers"
    c = {}

    def t():
        r = api("POST", "/customers/", {"name": f"ZZTEST Customer {TAG}", "phone": "81" + PH + "0"}, admin())
        expect_status(r, 201)
        c["id"], c["phone"] = r.data["id"], r.data["phone"]
        return f"Customer #{r.data['id']} created"
    run("CUS", M, "Create a customer with only name and phone", "201 Created", t)

    def t():
        r = api("POST", "/customers/", {"name": f"ZZTEST Full {TAG}", "billing_person_name": "Mr. Test", "phone": "82" + PH + "0",
                                       "whatsapp_number": "9876500000", "email": f"full{TAG}@example.com", "address": "1, Test Street, Chennai 600001",
                                       "gstin": "33ABCDE1234F1Z5", "reason": "UAT", "notes": "all fields"}, admin())
        expect_status(r, 201)
        c["full"] = r.data["id"]
        for k in ("billing_person_name", "whatsapp_number", "email", "address", "gstin", "notes"):
            expect(r.data.get(k), f"{k} was not saved")
        return "All fields (GSTIN, address, WhatsApp, e-mail, notes) saved"
    run("CUS", M, "Create a customer with every field filled", "201 and every field stored", t)

    def t():
        r = api("POST", "/customers/", {"phone": "9000099999"}, admin())
        expect_status(r, 422)
        return "422 validation error"
    run("CUS", M, "Create a customer without a name", "Rejected with 422", t)

    def t():
        r = api("POST", "/customers/", {"name": "Dup phone", "phone": c["phone"]}, admin())
        expect_status(r, 400)
        return "400 'Phone number already exists'"
    run("CUS", M, "Create a customer with a phone number already in use", "Rejected with 400", t)

    def t():
        r = api("GET", "/customers/", token=admin())
        expect_status(r, 200)
        expect(any(x["id"] == c["id"] for x in r.data), "not in list")
        return f"{len(r.data)} customers listed"
    run("CUS", M, "List customers", "200 with the new customer included", t)

    def t():
        r = api("GET", f"/customers/{c['id']}", token=admin())
        expect_status(r, 200)
        return "Customer returned"
    run("CUS", M, "Open one customer", "200", t)

    def t():
        expect_status(api("GET", "/customers/999999", token=admin()), 404)
        return "404 returned"
    run("CUS", M, "Open a customer that does not exist", "404 Not Found", t)

    def t():
        r = api("PUT", f"/customers/{c['id']}", {"name": f"ZZTEST Renamed {TAG}", "gstin": "33AAAPA1111M1Z9", "address": "New address"}, admin())
        expect_status(r, 200)
        expect(r.data["gstin"] == "33AAAPA1111M1Z9" and "Renamed" in r.data["name"], "update not saved")
        return "Name, GSTIN and address updated"
    run("CUS", M, "Edit a customer", "200 and changes stored", t)

    def t():
        r = api("GET", f"/customers/search/ZZTEST%20Renamed", token=admin())
        expect_status(r, 200)
        expect(any(x["id"] == c["id"] for x in r.data), "search did not find the customer by name")
        return f"Found by name ({len(r.data)} result)"
    run("CUS", M, "Search customers by name", "The customer is found", t)

    def t():
        r = api("GET", f"/customers/search/{c['phone']}", token=admin())
        expect_status(r, 200)
        expect(any(x["id"] == c["id"] for x in r.data), "search did not find the customer by phone")
        return "Found by phone number"
    run("CUS", M, "Search customers by phone number", "The customer is found", t)

    def t():
        r = api("GET", "/customers/search/%27%3B%20DROP%20TABLE%20customers%3B--", token=admin())
        expect_status(r, 200)
        again = api("GET", "/customers/", token=admin())
        expect_status(again, 200)
        return "Treated as plain text; customers table intact"
    run("CUS", M, "Search with SQL-injection text (security)", "Handled safely, no error, no data loss", t)

    def t():
        r = api("POST", "/customers/", {"name": "<script>alert(1)</script> " + TAG, "phone": "83" + PH + "0"}, admin())
        expect_status(r, 201)
        expect(r.data["name"].startswith("<script>"), "text altered")
        c["xss"] = r.data["id"]
        return "Stored as inert text (the screen escapes it when rendering)"
    run("CUS", M, "Name containing HTML/script tags (security)", "Saved as text only", t)

    def t():
        r = api("GET", "/customers/billing-defaults", token=admin())
        expect_status(r, 200)
        return f"Defaults: {r.data}"
    run("CUS", M, "Billing defaults for 'Start New Order'", "200 with the default billing person", t)

    def t():
        r = api("POST", "/customers/", {"name": "Unauth", "phone": "9000012345"})
        expect_status(r, 401)
        return "401 returned"
    run("CUS", M, "Create a customer without signing in", "401", t)

    for k in ("id", "full", "xss"):
        if k in c:
            def t(k=k):
                r = api("DELETE", f"/customers/{c[k]}", token=admin())
                expect_status(r, 204)
                expect_status(api("GET", f"/customers/{c[k]}", token=admin()), 404)
                return "Deleted; lookup now 404"
            run("CUS", M, f"Delete test customer ({k})", "204 and the customer is gone", t)

    # ------------------------------------------------------------------ TAXES
    M = "Taxes"
    tx = {}

    def t():
        r = api("POST", "/taxes/", {"name": f"ZZ GST {TAG}", "rate_percent": 7.5, "is_default": False, "is_active": True}, admin())
        expect_status(r, 201, 200)
        tx["id"] = r.data["id"]
        return "Tax 7.5% created"
    run("TAX", M, "Admin adds a new tax rate", "Created", t)

    def t():
        r = api("GET", "/taxes/", token=admin())
        expect_status(r, 200)
        expect(any(x["id"] == tx["id"] for x in r.data), "not listed")
        defaults = [x for x in r.data if x["is_default"]]
        expect(len(defaults) == 1, f"{len(defaults)} default taxes (must be exactly 1)")
        return f"Listed; exactly one default tax ({defaults[0]['name']} {defaults[0]['rate_percent']}%)"
    run("TAX", M, "List taxes - exactly one default tax exists", "Tax listed and a single default", t)

    def t():
        r = api("PUT", f"/taxes/{tx['id']}", {"rate_percent": 9.0}, admin())
        expect_status(r, 200)
        expect(r.data["rate_percent"] == 9.0, "rate not updated")
        return "Rate changed to 9%"
    run("TAX", M, "Edit a tax rate", "Rate updated", t)

    def t():
        old = [x for x in api("GET", "/taxes/", token=admin()).data if x["is_default"]][0]
        r = api("PUT", f"/taxes/{tx['id']}", {"is_default": True}, admin())
        expect_status(r, 200)
        now = [x for x in api("GET", "/taxes/", token=admin()).data if x["is_default"]]
        expect(len(now) == 1 and now[0]["id"] == tx["id"], f"{len(now)} defaults after switching")
        api("PUT", f"/taxes/{old['id']}", {"is_default": True}, admin())
        back = [x for x in api("GET", "/taxes/", token=admin()).data if x["is_default"]]
        expect(len(back) == 1 and back[0]["id"] == old["id"], "default not restored")
        return "Switching the default keeps exactly one default; original restored"
    run("TAX", M, "Make another tax the default", "Only one tax stays default", t)

    def t():
        r = api("POST", "/taxes/", {"name": "x", "rate_percent": 5}, as_role("counter"))
        expect_status(r, 403)
        return "403 Forbidden"
    run("TAX", M, "Counter user tries to add a tax", "403 (admin only)", t)

    def t():
        r = api("DELETE", f"/taxes/{tx['id']}", token=admin())
        expect_status(r, 204, 200)
        return "Deleted"
    run("TAX", M, "Admin deletes a tax", "Deleted", t)

    # ------------------------------------------------------------------ MASTERS
    for path, label, field in (("/machines/", "Machines", "name"), ("/printing-types/", "Printing Types", "name")):
        M = label
        mm = {}

        def t(path=path):
            r = api("POST", path, {"name": f"ZZ {TAG}", "is_active": True}, admin())
            expect_status(r, 201, 200)
            mm["id"] = r.data["id"]
            return "Created"
        run("MST", M, f"Add a {label[:-1].lower()}", "Created", t)

        def t(path=path):
            r = api("GET", path, token=admin())
            expect_status(r, 200)
            expect(any(x["id"] == mm["id"] for x in r.data), "not listed")
            return f"{len(r.data)} listed"
        run("MST", M, f"List {label.lower()}", "New entry is listed", t)

        def t(path=path):
            r = api("PUT", f"{path}{mm['id']}", {"name": f"ZZ renamed {TAG}", "is_active": False}, admin())
            expect_status(r, 200)
            expect(r.data["is_active"] is False, "not deactivated")
            return "Renamed and deactivated"
        run("MST", M, f"Rename and deactivate a {label[:-1].lower()}", "Changes saved", t)

        def t(path=path):
            expect_status(api("POST", path, {"name": "x"}, as_role("counter")), 403)
            return "403 Forbidden"
        run("MST", M, f"Counter tries to add a {label[:-1].lower()}", "403 (admin only)", t)

        def t(path=path):
            expect_status(api("DELETE", f"{path}{mm['id']}", token=admin()), 204, 200)
            return "Deleted"
        run("MST", M, f"Delete a {label[:-1].lower()}", "Deleted", t)

        def t(path=path):
            expect_status(api("PUT", f"{path}999999", {"name": "x"}, admin()), 404)
            return "404 returned"
        run("MST", M, f"Edit a {label[:-1].lower()} that does not exist", "404", t)
