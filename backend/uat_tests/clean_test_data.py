"""Removes the records the automated tests leave behind in a LOCAL test database (customers whose name starts with ZZ or UI, with their
quotations, invoices, job cards, challans and outsource jobs). Never run against production. Usage: python clean_test_data.py"""
import sys

from framework import BASE, admin, api

if "127.0.0.1" not in BASE and "localhost" not in BASE:
    sys.exit("refusing to run: this is not a local server (" + BASE + ")")


def get(path):
    r = api("GET", path, token=admin())
    return r.data if r.status == 200 else []


def main():
    customers = [c for c in get("/customers/?limit=5000") if (c["name"] or "").startswith(("ZZ", "UI"))]
    ids = {c["id"] for c in customers}
    print(len(customers), "test customers")
    invoices = [i for i in get("/invoices/?limit=5000") if i["customer_id"] in ids]
    jobs = [j for j in get("/job-cards/?limit=5000") if j["customer_id"] in ids]
    quotes = [q for q in get("/quotations/?include_orders=true&limit=5000") if q["customer_id"] in ids]
    challans = [d for d in get("/delivery-challans/") if d["customer_id"] in ids]
    outs = [o for o in get("/outsource/?limit=5000") if o.get("customer_id") in ids]
    done = {"invoices": 0, "jobs": 0, "quotations": 0, "challans": 0, "outsource": 0, "customers": 0}
    for o in outs:
        done["outsource"] += api("DELETE", f"/outsource/{o['id']}", token=admin()).status in (200, 204)
    for i in invoices:
        done["invoices"] += api("DELETE", f"/invoices/{i['id']}", token=admin()).status in (200, 204)
    for d in challans:
        done["challans"] += api("DELETE", f"/delivery-challans/{d['id']}", token=admin()).status in (200, 204)
    for j in jobs:
        done["jobs"] += api("DELETE", f"/job-cards/{j['id']}", token=admin()).status in (200, 204)
    for q in quotes:
        done["quotations"] += api("DELETE", f"/quotations/{q['id']}", token=admin()).status in (200, 204)
    for c in customers:
        done["customers"] += api("DELETE", f"/customers/{c['id']}", token=admin()).status in (200, 204)
    print("removed", done)


if __name__ == "__main__":
    main()
