"""Round 8: the help chat knows the Live Jobs board is grouped by service, and the job list the board is built from carries what the
grouping needs (every job has a product with a service)."""

from framework import admin, api, as_role, expect, expect_status, run

M = "Round 8 - Help chat and the grouped Live Jobs board"


def ask(q, tok=None):
    r = api("POST", "/assistant/ask", {"question": q}, tok or as_role("counter"))
    expect_status(r, 200)
    return r.data


def run_all():
    def t():
        cases = {
            "how are the live jobs grouped": "grouped by service",
            "show only bill book jobs on the live board": "Bill Books",
            "I want the xerox orders separate from the other jobs": "own titled section",
            "can I fold or collapse a service section": "fold",
            "are the jobs in priority order": "priority order",
            "how do I jump to the binding jobs section": "jump",
        }
        out = []
        for q, word in cases.items():
            r = ask(q)
            expect(r["found"] is True and word.lower() in r["answer"].lower(), (q, r["answer"][:160]))
            expect(r["link"] == "/dashboard", (q, r["link"]))
            out.append(r["answer"].split("\n")[0])
        return f"{len(cases)} questions about the grouped board all reach a Live Jobs answer: " + " | ".join(dict.fromkeys(out))
    run("R8B", M, "The help chat answers questions about the grouped Live Jobs board", "Right topic, link to the Dashboard", t)

    def t():
        r = ask("how do I see the live jobs")
        expect("grouped by service" in r["answer"].lower() or "Live Jobs" in r["answer"], r["answer"][:200])
        r2 = ask("where is the red live jobs button")
        expect("grouped by service" in r2["answer"].lower(), r2["answer"][:300])
        return "The older Live Jobs answers now mention the grouping too"
    run("R8B", M, "The existing Live Jobs answers mention the grouping", "Grouping mentioned", t)

    def t():
        jobs = api("GET", "/job-cards/", token=admin()).data
        products = {p["id"]: p for p in api("GET", "/products/?limit=5000", token=admin()).data}
        cats = {c["id"] for c in api("GET", "/product-categories/?limit=500", token=admin()).data}
        expect(jobs, "no jobs")
        missing = [j["job_number"] for j in jobs if products.get(j["product_id"], {}).get("category_id") not in cats]
        expect(not missing, f"jobs whose item has no service: {missing[:5]}")
        expect(all("priority" in j and "overdue" in j and "status" in j for j in jobs[:50]), "job fields for the priority order")
        return f"All {len(jobs)} jobs belong to a service, so each lands in a section; priority, overdue and status are on every job"
    run("R8D", M, "Every job card belongs to a service (so it lands in a section)", "No job without a service", t)
