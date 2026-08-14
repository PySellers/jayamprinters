# Sri Jayam Printers ERP — Handoff (2026-08-15 session)

This covers RBAC, the Purchases/Inventory module, and the Cash Ledger, added on `dev` on top of
the catalog/dashboard session documented further down this file (commit `0d2fd11`) and the
dual-format invoice printing added right before this session (commit `85cf50f`). Read this before
touching `backend/` or `frontend/`.

## What changed, and why

### 1. Role-Based Access Control (RBAC)

`app/models/user.py` gained a `role` column: `admin`, `counter`, `production`, `accounts`
(`UserRole` enum). `app/core/security.py` gained `require_role(*roles)`, a route dependency
factory that re-checks the DB-loaded user's role on every request (not a claim baked into the JWT,
so a role change takes effect on the user's very next request, not just after their token expires).
Admin always passes any `require_role(...)` check, by definition.

**How it's applied** (two patterns, both in use):
- Whole routers gated at registration in `app/main.py`: `user.router` is Admin-only,
  `cash_ledger.router` is Admin+Accounts-only.
- Individual routes gated in their own file via `dependencies=[Depends(require_role(...))]` on the
  route decorator, for routers that mix open reads with sensitive writes: `attribute.py`,
  `price_matrix.py`, `quantity_slab.py`, `extra_charge.py`, `product.py`, `masters.py`, `tax.py`
  (all writes Admin-only — this is the actual "admin page to enter price instead of making it
  public" the client asked for), `invoice.py` (delete invoice / delete payment), `job_card.py`
  (delete job card), `purchase.py` / `vendor.py` / `inventory.py` (writes Admin+Accounts, reads
  open to any staff).

**Deliberately left open to any logged-in role:** creating/updating customers, quotations, job
cards (status/comments/assignment), and invoices (create, record payment). A print shop's counter,
production, and accounts staff all legitimately touch these day to day — locking that down further
would block real workflows for no real security benefit. Only the *destructive or money-configuring*
actions are role-gated.

**Bootstrapping the first login:** there's still no public self-registration (by design). Run
`python -m app.utils.seed` once against a fresh database — it creates `admin@srijayam.com` /
`Admin@123` with role **admin** (previously it created that user with no role concept at all).
Log in as that account, then create real staff accounts with their real roles from the new
**Users** page (Admin-only nav item). Change that default password immediately.

**Frontend:** `AuthContext` now carries `role`. `ProtectedRoute` takes an optional `roles` prop —
routes without it are "any logged-in user"; routes with it 403-block (in the UI) anyone whose role
isn't in the list, admin always passes. `navConfig.ts` items also take a `roles` field; `Layout.tsx`
filters the sidebar by role, including hiding the entire "Masters" flyout for non-admins rather than
showing it as a dead end. New **Users** page (`pages/Users.tsx`, Admin-only): create/edit staff,
assign roles, activate/deactivate, reset passwords. Can't deactivate or delete your own account
from that screen (avoids a self-lockout).

### 2. Purchases / Inventory module

New models in `app/models/purchase.py`: `Vendor`, `InventoryItem` (name/unit/current_qty/
reorder_threshold), `Purchase` (mirrors `Invoice`'s shape — subtotal→total_amount, paid_amount,
status enum unpaid/partially_paid/paid), `PurchaseItem`, `PurchasePayment` (mirrors `Payment`).

Recording a purchase (`POST /purchases`) increments the named `InventoryItem.current_qty` for each
line automatically — that's the "stock update" Abi's summary mentioned. There's no
bill-of-materials/per-job consumption tracking (a purchase adds stock; nothing currently subtracts
it against a specific job) — stock only goes up through purchases and can be corrected by hand via
the Inventory page. `GET /inventory/low-stock` (and a `low_stock` flag on every item) flags anything
at or below its reorder threshold.

New pages: `pages/Purchases.tsx` (two tabs — Purchases with a multi-line create form and per-purchase
"record payment", and Vendors CRUD), `pages/Inventory.tsx` (stock list, low-stock banner, write
actions only rendered for Admin/Accounts — the backend enforces this regardless of what the UI
shows).

### 3. Cash Ledger

New models in `app/models/cash_ledger.py`: `CashTransaction` (receipt / payment / bank_deposit) and
`ChequeTransaction` (issued / deposited, with cheque no., bank/branch, cheque date, deposit date,
status pending/cleared/bounced). `GET /cash-ledger/summary` computes running Cash-in-Hand
(`receipts - payments - bank_deposits`) and Cash-in-Bank (`sum(bank_deposits)`) from the full
transaction history, same style as the sales/expense reports (computed in Python, not stored as a
running balance column, so there's nothing to get out of sync).

**Important scoping decision:** this ledger is hand-entered, not auto-generated from invoice or
purchase payments. An invoice payment can be cash, UPI, card, credit, or bank transfer — only actual
cash movements belong in a cash-in-hand register, and auto-posting every payment method would
overstate it. Staff record real cash movements directly (this matches how a physical daybook
works). Wiring specific payment methods through automatically is a reasonable next step once real
usage shows which methods should feed it — flagged in Known Gaps below, not built this session.

New page: `pages/CashLedger.tsx` (Cash Summary tab with balance cards + transaction log + a
"Record Transaction" form, Cheques tab with add + inline status dropdown). Whole module is
Admin/Accounts-only, gated at the router level, not per-route — nobody else should see cash
position.

### 4. Fixed the broken initial migration

`migrations/versions/79e5c16ffacc_create_users_and_customers_tables.py` had an empty `upgrade()`/
`downgrade()` despite being the very first migration everything else depends on — flagged as a known
gap in the previous session's handoff, not fixed then. It's filled in now to actually create the
`users` and `customers` tables matching the models as they existed at that point in history.
**Caveat:** if your database already has these tables (created via `Base.metadata.create_all`
outside Alembic, which is how this project has been bootstrapped so far), running the now-fixed
migration against it will fail with "table already exists." Fresh databases are unaffected; existing
ones need `alembic stamp 79e5c16ffacc` (or `alembic stamp head` if everything else is already
applied) before running migrations going forward, instead of replaying this one.

## Known gaps / things to fix or decide on

1. **Cash Ledger isn't linked to invoice/purchase payments yet** — see the scoping note above. If/when
   you want cash-method invoice payments to auto-post as a Cash Ledger receipt (and cash-method
   purchase payments to auto-post as a payment), that's a `services/invoice_service.py` /
   `services/purchase_service.py` change, not a data-model change — the tables already support it.
2. **No inventory consumption tracking.** Stock only increases (via purchases) or gets manually
   corrected on the Inventory page; nothing decreases it automatically when a job actually consumes
   material. Would need a bill-of-materials concept per product to do properly — real scope, not a
   quick add.
3. **Migration adoption caveat** — see the fixed-migration note above. Whoever runs this against an
   existing database needs to `alembic stamp` first, not blindly `alembic upgrade head`.
4. **Still true from before:** most catalog categories are still ₹0 placeholder pricing (see the
   catalog section further down this file) — this remains the single biggest thing before the shop
   can bill customers correctly. No customer dedup in the quick-order flow. No Purchases/Inventory
   reporting yet (Reports page still only covers sales/quotation-based numbers, not purchase
   expenses — though Cash Ledger's Payment-type transactions give a rough manual view of outgoing
   cash).
5. **RBAC is enforced but untested against a live database in this session** — I don't have a
   Postgres instance available where this was built, so the role-gating logic is verified by
   reading the code and compiling it (`py_compile` / `tsc --noEmit` both pass clean), not by
   actually logging in as each role and confirming a 403. Please do that pass before relying on it
   for real access control — log in as counter/production/accounts test accounts and confirm each
   is blocked exactly where it should be.

## Suggested next steps, roughly in priority order

1. **Test RBAC for real** — create one test user per role from the Users page, log in as each, and
   confirm the nav/actions match what's documented above. This is the highest-value five minutes
   before trusting this in front of the client.
2. **Enter real pricing** for the categories still at ₹0 (Pricing Setup + Price Matrix / Bulk Grid) —
   still the top blocker for real billing, unrelated to this session's work.
3. Decide whether to wire Cash Ledger to invoice/purchase payments automatically (see Known Gaps #1).
4. Fill in real inventory items and starting stock levels via the Inventory page once material types
   are known.
5. Native mobile app / remote monitoring, and further UI/UX passes, remain open per the client's
   original priority list.

---

## Previous session (2026-07-31) — catalog, dashboard, reporting

The client supplied a 24-page PDF spec (service menu + a rough home-page wireframe) describing
every service the shop sells and roughly how staff should take an order. Before that session, only
one service (Xerox/Photocopy) existed in the system, and there was no single-screen order-intake
flow, no live job status view, no job update history, and no sales reporting. That session closed
those gaps; the section below is its own original handoff note, left intact for reference.

### 1. Full service catalog (all 17 categories from the PDF)

`backend/seed_*.py` — one script per category (Invitation & Greeting Cards, Book Covers, Bill
Books & Stationery, Binding Services, Register, Transfer Certificate, Application Form, Visiting
Card, ID Card, Rubber Stamp, Menu Card, Thamboola Bag, Digital Banner), all using the existing
generic pricing engine (`ProductCategory` → `Attribute` → `AttributeOption`, `QuantitySlab`,
`PriceMatrixCell`, `ExtraCharge`). Run them once against your local DB:

```bash
cd backend && venv\Scripts\activate
python seed_invitation.py
python seed_book_covers.py
# ...one per category, see backend/seed_*.py
```

Each script is idempotent (safe to re-run, won't duplicate rows).

**Important — most prices are ₹0 placeholders.** The PDF's rate tables were blank templates with
no real numbers, except **Rubber Stamp**, which had a real size→price list (transcribed as-is —
e.g. Polymer Stamp A1 = ₹30). Everywhere else, someone needs to fill in real rates via **Pricing
Setup** (per-category attributes/slabs/extra charges) and **Price Matrix** (per-product rates).

**Modeling pattern worth understanding before adding a category:** the pricing engine requires an
*exact match* on every attribute selected on a line item to find its price
(`app/services/pricing_service.calculate_unit_price`). That means every `Attribute` you attach to
a `Product` multiplies the number of price cells needed — so:
- Only the 1–2 axes that genuinely drive a rate (usually paper/GSM type, occasionally + side)
  should be modeled as `Attribute`s feeding the price matrix.
- Independent add-ons (lamination, foiling, binding, designing charge, etc.) should be
  `ExtraCharge`s, not attributes — they don't get crossed into the matrix.
- Purely descriptive choices with no price impact (paper color name, card model name) go on the
  `spec_notes` free-text field, not as attributes — otherwise they'd force a combinatorial blow-up
  of price cells for zero benefit.

### 2. Bulk price-entry grid

`frontend/src/pages/PriceMatrix.tsx` has a **List / Bulk Grid** toggle. The bulk grid is a
spreadsheet (rows = quantity slabs, columns = attribute combinations) with one "Save All" action,
backed by `POST /price-matrix-cells/bulk`. Use this instead of the one-at-a-time dialog for
anything with more than ~30 cells (Visiting Card, Bill Books' per-size-fraction tables).

### 3. `spec_notes` on quotation/invoice line items

Nullable `spec_notes` column on `QuotationItem` and `InvoiceItem`, copied into `JobCard.notes` on
conversion. This is where descriptive-only choices live (see modeling pattern above).

### 4. Dashboard quick-order flow

`frontend/src/pages/Dashboard.tsx` / `components/dashboard/QuickOrderForm.tsx` — staff fill in
customer + delivery date/time + pick a service, and submitting auto-chains `Quotation` create →
convert to `JobCard` → generate `Invoice`, landing on the finished invoice. A counter/phone order
is already agreed, not a quotation pending approval — for a "real" quotation flow that stops for
approval, use `/quotations/new` without `?quick=1`.

### 5. Live Job Status + job comments

`components/dashboard/LiveJobStatusBoard.tsx` groups job cards into Pending / In Progress /
Delivered, with a pulsing red "overdue" indicator once `delivery_date` has passed and the job
isn't delivered — computed via plain `YYYY-MM-DD` string comparison (not `Date` arithmetic) to
avoid a timezone bug an earlier version had. `JobCardComment` model gives a running timestamped
log, separate from the single `notes` field.

### 6. Reports page

`frontend/src/pages/Reports.tsx` + `backend/app/api/reports.py` — sales totals by date range with
Excel export (`openpyxl`).

### Known gaps from that session (some resolved above, see notes)

1. ~~Broken original migration~~ — **fixed this session**, see above.
2. No customer dedup in the quick-order flow — still true.
3. ~~No RBAC~~ — **built this session**, see above.
4. ~~No Purchases/Inventory module~~ — **built this session**, see above.
5. Most categories still need real ₹ rates — still true, still the top priority.
6. ~~`spec_notes` has no frontend input yet~~ — resolved (per Abi's later update; not independently
   re-verified this session).
