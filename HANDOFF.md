# Sri Jayam Printers ERP — Handoff (2026-07-31)

This covers everything added on `dev` in the latest work session (commit `0d2fd11`), why it was
built that way, and what's left for the next person to pick up. Read this before touching
`backend/` or `frontend/`.

## Why this work happened

The client supplied a 24-page PDF spec (service menu + a rough home-page wireframe) describing
every service the shop sells and roughly how staff should take an order. Before this session, only
one service (Xerox/Photocopy) existed in the system, and there was no single-screen order-intake
flow, no live job status view, no job update history, and no sales reporting. This session closes
those gaps.

## What changed, and why

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
Setup** (per-category attributes/slabs/extra charges) and **Price Matrix** (per-product rates) —
see "Next steps" below.

**Modeling pattern worth understanding before adding a category:** the pricing engine requires an
*exact match* on every attribute selected on a line item to find its price
(`app/services/pricing_service.calculate_unit_price`). That means every `Attribute` you attach to
a `Product` multiplies the number of price cells needed — so:
- Only the 1–2 axes that genuinely drive a rate (usually paper/GSM type, occasionally + side)
  should be modeled as `Attribute`s feeding the price matrix.
- Independent add-ons (lamination, foiling, binding, designing charge, etc.) should be
  `ExtraCharge`s, not attributes — they don't get crossed into the matrix.
- Purely descriptive choices with no price impact (paper color name, card model name) go on the
  new `spec_notes` free-text field (see below), not as attributes — otherwise they'd force a
  combinatorial blow-up of price cells for zero benefit.

If you ignore this and cross too many attributes together, you'll end up needing hundreds of
manually-priced cells for one product (see Visiting Card: 23 qty brackets × 5 finishes × 2 sides =
230 cells — already the largest in the catalog, kept manageable by *not* also crossing paper color).

### 2. Bulk price-entry grid

`frontend/src/pages/PriceMatrix.tsx` now has a **List / Bulk Grid** toggle. The bulk grid is a
spreadsheet (rows = quantity slabs, columns = attribute combinations) with one "Save All" action,
backed by a new `POST /price-matrix-cells/bulk` endpoint. Use this instead of the one-at-a-time
dialog for anything with more than ~30 cells (Visiting Card, Bill Books' per-size-fraction tables).

### 3. `spec_notes` on quotation/invoice line items

New nullable `spec_notes` column on `QuotationItem` and `InvoiceItem`, copied into `JobCard.notes`
on conversion. This is where descriptive-only choices live (see modeling pattern above) — the
frontend doesn't yet expose an input for it on the line-item form (`QuotationLineItem.tsx`), so
it's currently only reachable via the API. **Frontend follow-up needed:** add a free-text field per
line item if you want staff to actually record these in the UI.

### 4. Dashboard quick-order flow

`frontend/src/pages/Dashboard.tsx` / `components/dashboard/QuickOrderForm.tsx` — matches the PDF's
home-page wireframe intent: staff fill in customer + delivery date/time + pick a service, and
submitting:
1. Creates a `Customer` record (see gap below — no dedup).
2. Navigates to `/quotations/new?quick=1&...` which pre-fills that product's specific attribute
   form (`QuotationCreate.tsx` + existing `QuotationLineItem.tsx` — unchanged, just pre-filled).
3. On submit, **auto-chains** `Quotation` create → convert to `JobCard` → generate `Invoice`, then
   lands on the finished invoice. This was a deliberate choice (confirmed with the client) — a
   counter/phone order is already agreed, not a quotation pending approval. If you ever need a
   "real" quotation flow that stops for approval, that's still `/quotations/new` without `?quick=1`.

New `Quotation.delivery_date` / `delivery_time` fields carry through to `JobCard.delivery_date` on
conversion.

### 5. Live Job Status + job comments

`components/dashboard/LiveJobStatusBoard.tsx` groups job cards into Pending / In Progress /
Delivered, with a pulsing red "overdue" indicator once `delivery_date` has passed and the job
isn't delivered. **Watch out for the date-comparison bug pattern here** — an earlier version
compared `Date` objects across a UTC/local timezone boundary and falsely flagged same-day
deliveries as overdue. It's fixed now (plain `YYYY-MM-DD` string comparison, see the comment in
`isOverdue()`), but if you touch this logic, keep it as string comparison, not `Date` arithmetic.

New `JobCardComment` model (`GET`/`POST /job-cards/{id}/comments`) — a running timestamped log
("waiting on spirals for the binding", etc.), separate from the single `notes` field. Surfaced in
the existing assign dialog on the Job Cards page.

### 6. Reports page

`frontend/src/pages/Reports.tsx` + `backend/app/api/reports.py` — sales totals by date range
(Today/This Week/This Month/Custom presets) with an Excel export (`openpyxl`, added to
`requirements.txt`). **Purchases/expense reporting is not included** — there's no
Purchases/Inventory module yet at all (see Next steps).

## Known gaps / things to fix or decide on

1. **Broken original migration** — `migrations/versions/79e5c16ffacc_create_users_and_customers_tables.py`
   has an empty `upgrade()`. It wasn't touched this session (worked around by building schema
   directly from models rather than replaying full migration history) but it means `alembic
   upgrade head` from a truly empty database will fail partway through. Needs a real fix.
2. **No customer dedup in the quick-order flow** — every dashboard order creates a brand-new
   `Customer` row, even for a repeat caller. Fine for a first pass; if duplicate customers become a
   real problem, add a phone-number lookup before create.
3. **No RBAC** — still true from before this session (see README's own Known Gaps). Any logged-in
   user can do anything.
4. **No Purchases/Inventory module** — vendors, material purchases, stock levels don't exist yet.
   This was explicitly scoped out of this session (flagged to the client as a separate phase).
5. **Most categories still need real ₹ rates** — see catalog section above. This is the single
   biggest remaining piece of work before the shop can actually bill customers correctly.
6. **`spec_notes` has no frontend input yet** — see item 3 above.
7. Two harmless test records exist from this session's verification (a "Test Customer" and a couple
   of test quotations/invoices/job cards) — fine to delete via the UI, not required.

## Suggested next steps, roughly in priority order

1. **Enter real pricing** for the 16 categories still at ₹0 (Pricing Setup + Price Matrix / Bulk
   Grid). Nothing else matters to the shop until this is done.
2. Fix the broken `79e5c16ffacc` migration so a fresh database can actually run the full migration
   history (currently only works because we bypass it by building schema from current models).
3. Add a `spec_notes` input to `QuotationLineItem.tsx` so staff can actually record paper color /
   card model / custom instructions per line item.
4. Purchases & Inventory module (Vendor / Purchase / InventoryItem / StockMovement models +
   basic UI) — the natural next phase once catalog pricing is in place.
5. RBAC (role field on `User`, route-level permission checks) — worth doing before this goes to
   a real multi-staff shop floor.
6. Once there's a few months of real sales data: trend-based low-stock/reorder suggestions on top
   of the Reports page (deliberately deferred — not worth building against zero historical data).

## Running it locally

See `README.md` for the full setup (Postgres + FastAPI backend, Vite + React frontend). Backend
now depends on `openpyxl` in addition to what's already listed — `pip install -r requirements.txt`
picks it up. Local admin login for testing: `admin@srijayam.com` / `Admin@123` (seeded via
`backend/app/utils/seed.py`).

## Update — 2026-07-31: migration fix, spec_notes UI, RBAC

Picked up the next-steps list above (items 2, 3, 5) plus part of item 8 from the client punch list
(assign-by-department). Real pricing entry (item 1) still needs the client's actual rate data, so
it's untouched — nobody has real numbers to enter for the other 16 categories yet.

### Fixed the broken `79e5c16ffacc` migration
It's the root migration (`down_revision = None`) but had an empty `upgrade()`. Turned out `customers`
was already being created as a side effect of a later migration (`1bab961191b5`), but `users` was
never created anywhere — a truly empty database would fail as soon as `job_cards` tried to add its
`designer_id`/`operator_id` foreign keys to a nonexistent table. `upgrade()` now creates `users`
(not `customers` — that's still `1bab961191b5`'s job, duplicating it would break a fresh DB the
other way). Verified by running the full chain against a throwaway Postgres schema from empty —
`alembic check` also confirms models and migrations now match exactly.

### `spec_notes` UI field
Added the "Paper Color / Custom Notes" free-text field to `QuotationLineItem.tsx`, wired to the
`spec_notes` column that already existed on the backend. It's intentionally *not* reset when the
product changes (unlike `selected_options`/`extra_charge_ids`) since it's free text, not tied to a
category's attribute set.

### RBAC
Four roles on `User`: `admin`, `counter`, `production`, `accounts` (+ a free-text `department`
column for filtering/labeling, not a full Department table — that felt like overkill for what's
just being used to group staff in a picker right now). New migration `373232cd4694`. Enforcement:

- `require_roles(*roles)` in `core/security.py`, used as a route `dependencies=[...]`.
- **Admin only**: Pricing Setup (attributes/quantity-slabs/extra-charges/price-matrix), Masters,
  Taxes, Product/Category mutations, User management, job-card/invoice deletion.
- **Production or admin**: job-card status updates and assignment (machine/designer/operator).
- **Accounts or admin**: payment recording/deletion, the whole Reports router.
- Left deliberately **open to every role**: customer/quotation/invoice creation (the counter-driven
  quick-order flow needs this), job-card comments (anyone should be able to log a production
  update), all GET endpoints (staff still need to read the catalog/attributes to build a quotation).
- `POST /users/` and `PUT /users/{id}` (admin-only) are new — there was previously no way to create
  a second user at all except direct DB/seed-script access. New `/users` frontend page (admin-only
  nav item) covers this.
- Frontend: `ProtectedRoute` now takes an optional `roles` prop, nav items in `navConfig.ts` take an
  optional `roles` array and get filtered in `Layout.tsx`, and a few pages (`JobCards.tsx`,
  `InvoiceDetail.tsx`, `Products.tsx`) hide role-gated buttons/icons client-side to match what the
  API will actually allow — but the API-level check is what actually matters, the UI hiding is just
  to avoid dead-end clicks.
- The designer/operator pickers on the Job Cards assign dialog now show `Name (Department)` instead
  of just `Name`, so assignment can be done by department at a glance, per the client ask.
- The pre-existing `admin@srijayam.com` seed user is promoted to `role='admin'` by the migration
  itself (everyone else defaults to `counter`); `backend/app/utils/seed.py` now sets `role=admin`
  explicitly too, for anyone re-seeding a fresh DB.

### Still open
Real pricing data, mobile/offline visibility, general UI/UX polish, and deeper exploratory
reporting are all still exactly as described above.

## Update — 2026-07-31 (same day, second pass): Purchases/Inventory module

Picked up item 4. Deliberately minimal — no purchase-order/draft/approval workflow, since nobody
asked for one and it would be pure speculation about a process this shop doesn't have yet.

- **New models**: `Vendor` (mirrors `Customer`'s shape), `InventoryItem` (name/unit/current_stock/
  reorder_level — raw materials like paper/ink, not the finished-goods `Product` catalog),
  `StockMovement` (append-only ledger: `purchase_in`/`consumption`/`adjustment`, signed quantity),
  `Purchase`/`PurchaseItem` (a vendor bill with line items). Migration `d25026cfb851`.
- **A `Purchase` is received on creation, not on a separate "receive" step** — `create_purchase`
  (`services/purchase_service.py`) creates the bill *and* a `purchase_in` `StockMovement` per line
  item, incrementing `InventoryItem.current_stock` immediately. This assumes purchases are recorded
  after goods physically arrive (counter/accounts logging a delivery), not used to place orders in
  advance. If the shop actually needs a "goods on order but not yet received" state, that's a
  bigger change (a status field + a separate receive action) — didn't build it speculatively.
- Deleting a purchase reverses the stock it added (a negative `adjustment` movement per item) rather
  than leaving `current_stock` silently wrong — see `delete_purchase`.
- Manual stock correction (miscount, wastage) is a separate endpoint,
  `POST /inventory-items/{id}/adjust`, independent of purchases.
- **RBAC**: reads open to everyone (so production/counter can see stock levels); vendor/purchase
  mutations and stock adjustments are `accounts`+`admin`; inventory item master data (create/edit/
  delete the item definitions themselves, as opposed to their stock levels) is `admin`-only.
- **Frontend**: three new pages — `Vendors.tsx` (plain CRUD), `InventoryItems.tsx` (stock levels,
  low-stock rows highlighted red when `current_stock <= reorder_level`, an "Adjust Stock" dialog),
  `Purchases.tsx` (list + a create dialog with dynamic line items, live grand-total preview). All
  three are nav-gated to `admin`/`accounts` in `navConfig.ts`.
- Verified end-to-end against the real dev DB before committing: created a vendor, an inventory
  item, a purchase — confirmed `current_stock` incremented by exactly the purchased quantity, then
  cleaned up the test rows.

### Still open
Real pricing data, mobile/offline visibility, general UI/UX polish, and deeper exploratory
reporting.

## Update — 2026-07-31 (third pass): order type + light exploratory reporting

Picked up "insert offline/online types in the orders" and made a start on "enhance the report to
find out maximum level of exploratory analysis" — confirmed with the client that offline/online
just means walk-in-at-the-counter vs. phone/relayed-order, a plain tag with no different workflow
or fields, not two different order pipelines. Kept it exactly that scoped.

- `OrderType` enum (`offline`/`online`) on `Quotation`, defaults to `offline`, propagates to
  `Invoice` on conversion (same pattern as `spec_notes`). Migration `fad51d6558ec`.
- Set via a Walk-in/Phone-Remote toggle on both order-entry paths: the dashboard `QuickOrderForm`
  and the full `QuotationCreate` form (disabled there when arriving from a quick order, since it's
  already been set and re-editing it there would just be confusing).
- Shown as a column/chip on the Quotations and Invoices list pages.
- **Reporting**: added `by_order_type` (walk-in vs. phone/remote revenue split) and `top_products`
  (top 10 by revenue in the selected range) to `GET /reports/sales` and the Excel export, and two
  new panels on the Reports page. This is a first pass at "exploratory analysis," not the whole of
  it — no trend lines, no comparison-to-prior-period, no drill-down. Worth returning to once
  there's actually a few months of data to make that kind of thing meaningful (same reasoning
  HANDOFF already gave for deferring low-stock/reorder trend suggestions).
- Verified end-to-end: created a quotation with `order_type=online` against a product with real
  pricing (Rubber Stamp), converted it, confirmed the invoice inherited `order_type=online`, and
  confirmed both new report fields reflected that sale correctly. Cleaned up the test records after.

### Still open
Real pricing data for the other 16 categories, mobile/offline visibility, general UI/UX polish, and
the rest of "exploratory reporting" beyond this first pass (trends, comparisons, drill-downs).
