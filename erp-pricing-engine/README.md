# Sri Jayam Printers — Billing / Order Platform (working prototype)

A running FastAPI backend + two installable web apps covering **every product family in the
rate-card PDF** (16 categories, all 24 pages), online ordering, live job-status monitoring, and
sales reporting. This is a real, runnable system — not a mockup — built against the design in
`Sri_Jayam_Printers_ERP_Blueprint.docx`.

## What's actually here

**Backend (FastAPI + SQLAlchemy, `app/` + `main.py`)**
- **Full catalog** (`app/seed_data.py`): Wedding Invitation (Offset & Screen), Readymade
  Invitation, Cover — Customised Offset, Readymade Cover, Visiting Card (real 23-band quantity
  pricing from 50 to 40,000 pcs), ID Card, Stationery/Bill Book (12 document types: letterhead,
  invoice, bill book, cash memo, delivery challan, gate pass, visitor pass, prescription, cash
  voucher, trip sheet, estimate, exam sheet), Register, Application Form, T.C./Transfer
  Certificate, Menu Card, Rubber Stamp — Polymer (71 real SKU prices transcribed from page 20),
  Self-Ink Stamp, Digital Banner/Flex/Sticker, Thamboola Bag. Every size, paper, GSM, lamination,
  binding, and special-work option from the PDF is a selectable attribute.
- **Pricing engine** (`app/pricing_engine.py`): resolves quantity-slab + attribute-matrix pricing
  or flat-SKU pricing, used identically by the quote preview, job cards, and multi-item orders.
- **Orders** (`app/routers/orders.py`): a checkout can bundle several product lines into one
  `Order` (`ORD-00001`), each becoming its own `JobCard` (`JOB-00001`) with its own production
  stage. `source` is tagged `"online"` (storefront) or `"counter"` (staff-entered).
- **Job Cards** (`app/routers/jobs.py`): per-item production tracking through
  Order Taken → DTP → Proof (Customer) → Proof (Press) → Printing → Finishing → Dispatched, plus
  named staff attribution per stage (`dtp_by`, `machine_man_by`, `rubber_stamp_by`, `numbering_by`,
  `binding_by`, `proof_verified_customer_by`, `proof_verified_press_by`) and a computed
  `GET /jobs/reminders` feed (overdue deliveries, deliveries due within 24h, orders with an unpaid
  balance) — the "blinking delivery date / payment" cue from the rate-card PDF's home-page mockup.
- **Reports** (`app/routers/reports.py`): `GET /reports/summary?range=daily|weekly|monthly|yearly`
  (sales) and `GET /reports/expenses?range=...` (cash payments/expenses) — both aggregated in
  Python so they work the same on SQLite (dev) and Postgres (production).
- **Parties** (`app/routers/parties.py`): customer master.
- **Auth / RBAC** (`app/security.py`, `app/auth.py`, `app/routers/auth.py`): username/password
  login (`POST /auth/login`) issuing an HMAC-signed bearer token, four seeded roles — `admin`,
  `counter`, `production`, `accounts` — enforced per-endpoint via a `require_role(...)` dependency.
  Admin-only actions: catalog price/option changes, order cancellation. Admin + Accounts: cash,
  cheque, vendor-bill, and inventory entries. All logged-in roles: read-only catalog/reports.
- **Accounts / Finance** (`app/routers/accounts.py`): Cash in Hand / moved-to-bank ledger
  (`/accounts/cash`), cheque lifecycle — issued or deposited, cheque no., bank/branch, cheque date,
  deposit date, pending/cleared/bounced status (`/accounts/cheques`), vendor bills with paid/balance
  tracking (`/accounts/vendor-bills`), and low-stock inventory (`/accounts/inventory`,
  `/accounts/inventory/low-stock`) — covers the rate-card PDF's Sales Report page (cash, bank,
  cheques, stock value, low stock all in one place).
- **Order payment & cancellation** (`app/routers/orders.py`): `POST /orders/{no}/payment` records a
  partial/full payment against an order's balance; `POST /orders/{no}/cancel` is an admin-only
  **soft** cancel (status flip, not a hard delete, so job/order numbers already given to a customer
  stay valid for audit).
- **Catalog admin** (`app/routers/catalog.py`): admin-only `PATCH` on price cells and extras,
  `POST`/`DELETE` on attribute options, `POST`/`PATCH`/`DELETE` on SKUs — the "admin page to enter
  price instead of making it public" the shop asked for, and the mechanism for adding/removing a
  paper brand or size without a code change.

**Customer storefront — `web/storefront.html`**
Catalog grid → live-priced configurator → cart → checkout → online order → printable
confirmation → order tracking by order number. Installable as a PWA (`manifest.json` +
`service-worker.js` + icons) — open it in Chrome/Edge on a phone or desktop and use "Add to Home
Screen" / "Install app" to get an app-like icon and standalone window, no app store needed.

**Staff dashboard — `web/admin.html`**
Gated behind a login screen (`POST /auth/login`). Tabs, shown/hidden by role:
- **Home** — quick order-intake form (date, order-taken-by, mobile/alt mobile, address, category
  configurator with live pricing), a Reminders panel (overdue items blink red), and a Job Status
  list where any staff member can record who did DTP / Machine / Rubber Stamp / Numbering /
  Binding / Proof Verified (Customer) / Proof Verified (Press) on a given job.
- **Job Board** — kanban by production stage, auto-refreshes every 5s.
- **Orders** — every order with grand total / paid / balance, a "Record payment" action, and an
  admin-only "Cancel" action.
- **Reports** — daily/weekly/monthly/yearly Sales Graph and Expense Graph (Chart.js).
- **Accounts** — Cash in Hand/Bank, Cheques, Stock Value/Vendor Bills, Low Stock. Write forms only
  render for `admin`/`accounts` roles; everyone else sees read-only tables.
- **Catalog Admin** (admin-only nav item) — edit price-cell rates and extra-charge amounts,
  add/remove attribute options, add/edit SKU prices, per category.
- **Parties** — customer list.

Dev logins seeded on startup (**change before real use**): `admin`/`admin123`,
`counter`/`counter123`, `production`/`production123`, `accounts`/`accounts123`.

**`order_entry.html`** (root of this folder) — the earlier single-form quick-quote tool. Still
works, now mostly superseded by the storefront/admin pair above.

## Honest scope notes — read before demoing this to anyone

1. **Prices are placeholders except rubber stamps.** The PDF's price cells for every category
   except Rubber Stamp — Polymer (page 20) were blank templates in the source document — the shop
   hadn't filled in rupee values yet. Every category here has its full real attribute/size/paper
   list, but most quote a flat placeholder rate per quantity slab regardless of which options are
   picked, clearly marked `# PLACEHOLDER` in `app/seed_data.py`. **Do not quote a real customer
   from this data until someone keys in the shop's actual rates** — that's a data-entry pass into
   `PriceMatrixCell` rows, not a code change (that's the point of the metadata-driven design).
2. **No native iOS/Android or .exe build.** `web/storefront.html` is a responsive, installable
   Progressive Web App — it behaves like a real app on phones and desktops (icon, standalone
   window, works from a flaky connection for the shell) but isn't published through an app store.
   A true native build is a separate project needing Xcode/Android Studio, signing certificates,
   and store accounts.
3. **No payment gateway, GST return filing, or SMS/WhatsApp notifications yet** — those are
   Phase 4/5 items in the blueprint doc, not built here.
4. **No database migrations.** Schema changes (like the ones in this update) mean your local
   `erp.db` from an earlier run is now out of date — **delete `erp.db` and let it re-seed** rather
   than trying to reuse it. Production would use Alembic migrations instead of this delete/reseed
   dance (see "Next steps" below).
5. **Auth here is scaffold-only, not production security.** `app/security.py`/`app/auth.py`
   implement password hashing (PBKDF2-HMAC-SHA256) and HMAC-signed tokens with plain Python stdlib
   (no external JWT library was installable in the sandbox this was built in). It is functionally
   real RBAC — roles are genuinely enforced per-endpoint — but before this goes anywhere near a
   real deployment: change the 4 default passwords immediately, move the HMAC secret out of source
   into an environment variable/secrets manager, add token expiry/refresh and rate-limiting on
   `/auth/login`, and ideally replace it with the main project's existing JWT auth (this was always
   meant to merge into that, not stand alone — see `app/auth.py`'s module docstring).
6. **Order cancellation is soft-delete only.** `POST /orders/{no}/cancel` flips a status flag; nothing
   is ever hard-deleted from the database, by design (keeps job/order numbers valid for audit even
   after cancellation). There's no "permanently erase this order" action anywhere in the app.

## Run it

```bash
cd erp-pricing-engine
pip install -r requirements.txt --break-system-packages   # or use a venv
rm -f erp.db                                               # only if you have an old DB from before
python main.py                                             # http://localhost:8000/docs
```

Then open, directly in your browser (double-click, or File > Open — no build step, no server
needed for the frontend itself):

- `web/storefront.html` — customer-facing ordering site
- `web/admin.html` — staff dashboard (job board / reports / customers)

Both talk to `http://localhost:8000`, so keep the `python main.py` terminal running.

## Try the API directly

```bash
# Sign in as admin, then use the token for a role-gated write
curl -s -X POST http://localhost:8000/auth/login -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "admin123"}' | python -m json.tool
# -> copy the "token" field into the header below
curl -s -X PATCH http://localhost:8000/catalog/price-cells/1 \
  -H "Content-Type: application/json" -H "Authorization: Bearer <token>" \
  -d '{"base_rate": 5.50}'

# A live quote
curl -s -X POST http://localhost:8000/quotes/calculate -H "Content-Type: application/json" -d '{
  "category_code": "VISITING_CARD", "quantity": 500,
  "selected_options": {"LAMINATION": "Matt Lamination"}, "extra_codes": ["FOILING"]
}' | python -m json.tool

# Place a 2-item online order
curl -s -X POST http://localhost:8000/orders -H "Content-Type: application/json" -d '{
  "source": "online",
  "party": {"name": "Test Customer", "mobile": "9999999999"},
  "items": [
    {"category_code": "VISITING_CARD", "quantity": 500, "selected_options": {"LAMINATION": "Matt Lamination"}, "extra_codes": []},
    {"category_code": "RUBBER_STAMP_POLYMER", "quantity": 2, "selected_options": {"SKU": "C13_54X54"}, "extra_codes": []}
  ]
}' | python -m json.tool

# Sales report
curl -s "http://localhost:8000/reports/summary?range=monthly" | python -m json.tool
```

## Next steps toward production

1. **Fill in real prices.** Go category-by-category through `app/seed_data.py`, replacing the
   placeholder `PriceMatrixCell` rows with the shop's actual rate-card numbers (ideally one cell
   per real size/paper/GSM combination once you have them, not just one flat rate per slab).
2. Move this into the existing FastAPI project (the one with login/dashboard/Customer CRUD) and
   point `app/database.py` at the same Postgres instance.
3. Add Alembic migrations instead of `Base.metadata.create_all`.
4. Add payment collection, GST-compliant invoice PDFs, and SMS/WhatsApp delivery reminders
   (Section 5.5/5.6 of the blueprint doc).
5. If/when a true native mobile app is wanted, React Native can reuse the same API and most of the
   storefront's logic/types.
