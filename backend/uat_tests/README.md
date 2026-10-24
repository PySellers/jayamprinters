# Sri Jayam ERP - automated UAT test suite

Two suites that drive the real application the way staff do, plus a report builder.

| Suite | What it covers | Needs |
|---|---|---|
| `run_all.py` (system / API tests) | every API action, role permissions, validation, pricing engine, all 14 services (every saved rate replayed + a full order per service), orders -> invoices -> job cards -> challans, payments, purchases, inventory, cash ledger, cheques, reports, PDFs | backend running, Python (standard library only) |
| `ui_run.mjs` (browser tests) | sign-in / roles / every screen, add-edit-delete on each master, Start New Order for every service, payments, printing, job cards, pricing setup, price grid, quotations, layout at 5 screen sizes | frontend + backend running, Node, `npm i playwright-core`, Chrome |

## Run against a local copy (never against live client data)

```bash
# 1. backend + frontend running locally (see the project README), demo data loaded
cd backend
python seed_uat_demo_data.py                # once, if the demo data is not there yet

# 2. system tests -> uat_tests/results.json
python uat_tests/run_all.py                 # or: python uat_tests/run_all.py t_orders

# 3. browser tests -> uat_tests/ui_results_*.json
python uat_tests/dump_ui_specs.py           # writes ui_specs.json (expected prices for the screens)
cd uat_tests && npm i playwright-core && node ui_run.mjs          # all suites
node ui_run.mjs access crud layout extra orders                   # or pick suites

# 4. Excel report
python uat_tests/build_report.py uat_tests/results.json ui_results.json report.xlsx [screenshots-dir]
```

Environment variables: `UAT_BASE` (API url), `UAT_UI` (frontend url), `UAT_ADMIN_PASSWORD`, `UAT_STAFF_PASSWORD`,
`CHROME_PATH`, `UAT_SHOTS` (screenshot folder).

The tests create records named `ZZTEST...` / `UITEST...` and remove most of them; they are meant for a local or
staging copy, not for the live database.
