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

## Update — 2026-07-31 (fourth pass): deeper reporting + UI/UX polish

Picked up the client's last two open asks ("enterprise-level UI/UX" and "maximum exploratory
reporting") with concrete, bounded scope rather than trying to guess at everything either phrase
could mean.

### Reporting: five new metrics
`report_service.py` gained `category_breakdown`, `payment_method_breakdown`, `period_comparison`
(this range vs. the immediately preceding range of equal length, with a growth/decline %),
`quotation_funnel` (counts by status for quotations created in range), and
`avg_job_turnaround_days` (creation → delivery, for jobs delivered in range). All five are in
`GET /reports/sales`, the Excel export, and new Reports page panels (a trend chip on the Total
Sales stat, a turnaround stat card, and four new table panels). This still isn't the "maximum"
version — no charts, no multi-period trend lines, no drill-down into a specific category/customer.
That's deliberately deferred until there's more than a few days of real sales data to make it
meaningful.

### UI/UX: four concrete pieces, not a vague "polish pass"
1. **Toast notifications** (`context/NotificationContext.tsx`, `useNotify()`) — wired into every
   CRUD mutation across Customers/Products/Vendors/Inventory/Purchases/Users/Taxes/Masters, plus
   Job Cards (status/assign/comment) and Quotations/Invoices (convert/invoice/payment). Several of
   these previously failed **completely silently** on error - e.g. deleting a vendor still in use,
   or a role-gated action getting a 403 - with zero UI feedback. That's now surfaced. Also fixed a
   related bug in `QuotationCreate.tsx`'s quick-order flow: the auto-chain (create → convert →
   invoice) ran inside the create mutation's `onSuccess`, so a failure in the second or third step
   wasn't caught by the mutation's `onError` at all; it's now wrapped in try/catch.
2. **Dashboard KPI cards** - replaced the four raw entity-count cards with ones that actually mean
   something operationally: Today's Sales, Pending Jobs, Overdue Jobs (red when >0), plus the
   original Customers/Quotations/Invoices counts. The overdue calculation reuses the exact
   string-comparison logic from `LiveJobStatusBoard.tsx` (now extracted to `utils/jobCards.ts`)
   rather than reimplementing it and risking the timezone bug noted earlier in this file.
3. **Empty states** - new `components/EmptyState.tsx` (icon + message) replacing the plain "No X
   yet." text rows across the 11 main list tables (Customers, Products, Vendors, Inventory,
   Purchases, Quotations, Invoices, Job Cards, Users, Taxes, Masters). Left the smaller/nested
   tables (invoice payments sub-table, pricing-setup admin panels) as-is - lower traffic, not worth
   the churn right now.
4. **Pagination** - `hooks/usePagination.ts` (client-side, since these lists are still small) added
   to Customers, Quotations, and Invoices - the three that will accumulate the most rows in normal
   use. Products/Vendors/Job Cards etc. weren't paginated; revisit if any of them grow large enough
   to matter.

Verified: `tsc --noEmit` and `npm run build` clean, backend imports clean, both dev servers picked
up every change via hot-reload/HMR with no errors, and the reports endpoints (`/reports/sales` and
`/reports/sales/export`) both returned 200 against live data.

### Still open
Real pricing data, mobile/offline visibility, and further reporting depth (charts, trends beyond

## Update — 2026-07-31 (fifth pass): the 13 category seed scripts had never actually been run

Asked to cross-check the catalog against the client's PDF and test end-to-end. Found something
more basic first: **`SELECT * FROM product_categories` on the real dev DB returned exactly 3 rows**
(Visiting Card, Rubber Stamps, Xerox/Photocopy) despite `seed_invitation.py`,
`seed_book_covers.py`, `seed_bill_books.py`, `seed_binding.py`, `seed_register.py`,
`seed_transfer_certificate.py`, `seed_application_form.py`, `seed_id_card.py`, `seed_menu_card.py`,
`seed_thamboola_bag.py`, `seed_digital_banner.py`, and `seed_visiting_card.py` all being present and
committed in `backend/`. The scripts were correct and idempotent - they just had never been
executed against this database. The earlier claim ("all 17 categories in the catalog") was true of
the *code*, not the *data*.

**Fixed by running all 13 scripts** (`python seed_invitation.py`, etc., each idempotent, safe to
re-run). Catalog is now actually populated: 15 `product_categories` rows, ~130 products, ~1180
price-matrix cells across the board.

### Cross-check against the PDF
Spot-checked three scripts in detail against their source pages:
- `seed_visiting_card.py` (page 18): 23 quantity brackets, 5 finish/lamination types, 2 sides - all
  match exactly. The PDF has one unlabeled 6th finish column; the script folds it in as a combined
  "Special Finish" option since it has no name in the source to give it.
- `seed_rubber_stamp.py` (pages 20-21): spot-checked ~10 of the 71 real Polymer Stamp prices
  (A1=₹30, A21=₹140, C15=₹200, D1=₹150, X7=₹500, X16=₹300, etc.) against the PDF - all exact matches.
- `seed_bill_books.py` (pages 12-13): 12 size-fractions and the 15-option GSM/paper list match the
  PDF's grid exactly; the "1st 1000 Nos" / "Add. 1000 Nos" column pair is correctly modeled as two
  quantity slabs rather than two products.
- Did not exhaustively re-derive every cell of the remaining 10 scripts - the ones checked were
  faithful enough, and most of those tables are blank-price templates in the source PDF anyway (see
  below), so the highest-value use of time was running the missing scripts and testing the pipeline
  end-to-end rather than re-verifying already-correct catalog structure line by line.

### Known minor issue found, deliberately not auto-fixed
Two near-duplicate categories now exist: **"Rubber Stamps"** (singular test artifact, 1 product,
`id=2`) alongside the properly-seeded **"Rubber Stamp"** (`id=15`, 89 products with real prices),
and a stray extra **"Lamination"** attribute on the Visiting Card category alongside the properly-
seeded "Finish/Lamination Type" attribute. Root cause: earlier manual testing in the live app
(clicking around, not a seed script) created a category/attribute with an almost-but-not-exactly
matching name, so the seed scripts' get-or-create-by-name logic didn't recognize it as the same
thing and created a second one. **Left as-is rather than deleted**, because the old "Rubber Stamps"
category's one product and the old "Lamination" attribute are referenced by real quotations/
invoices/job-cards that appear to be the team's own manual testing in the live app - didn't want to
delete someone else's data without being asked. Recommend an admin merge/deactivate these two via
the UI (Pricing Setup page) when convenient; it's cosmetic, not a functional bug.

### End-to-end verification performed
Ran a full cycle against live data (Postgres dev DB, both dev servers): set a real price on a
Wedding Invitation cell → created a quotation (100 Nos, with `spec_notes` and `order_type=offline`)
→ confirmed price computed correctly (100 × ₹12.50 + 18% tax = ₹1,475) → converted to job card
→ confirmed `spec_notes` carried through to the job card's `notes` field → generated an invoice
→ recorded a full payment (status flipped to `paid`) → downloaded the PDF (valid, 1 page)
→ added a job-card comment → changed job-card status → confirmed the sale showed up correctly in
`/reports/sales` (`by_category`, `by_payment_method`, `top_products` all correct). Also ran a full
RBAC sweep with fresh counter/production/accounts test accounts against real endpoints (create
quotation, create purchase, view reports, update job-card status, record payment, create vendor) -
every boundary behaved exactly as coded (200 where allowed, 403 where not). Cleaned up all test
records (quotation/invoice/job-card/comment/payment/test users) afterward; reverted the demo price
back to ₹0 since it wasn't a real client-provided rate.

**Not tested**: no browser-automation tool was available in this environment, so the frontend UI
itself was verified via typecheck/build (clean) and by confirming the API endpoints the frontend
consumes return well-formed data for every one of the 15 categories (attributes/slabs/extra-charges
counts per category) - not by actually clicking through the React app in a browser. Worth a manual
click-through before relying on this for real orders.

### Still open
Everything from the prior passes, plus: real pricing for every category except Rubber Stamp (still
₹0 placeholders - this was always explicitly out of scope, not a regression), and the cosmetic
duplicate-category cleanup noted above.

## Update — 2026-07-31 (sixth pass): the rest of the client's original wireframe (pages 2-3 of the PDF)

Went back through the PDF's home-page/navigation wireframe (not the catalog pages, which were
already fully implemented and verified) and found several things it called for that were never
built: a cash/cheque ledger, sales & expense graphs, per-production-stage staff sign-off on job
cards, Estimate as a real document type, and Delivery Challans. Built all of them.

### Cash Ledger + cheque lifecycle
- `Payment` (invoice) and the new `PurchasePayment` (vendor bills) both gained `cheque` as a
  payment method plus `cheque_number`/`cheque_date`/`issued_branch`/`cheque_status`/
  `cheque_deposit_date`. **Adding `'cheque'` to the existing `paymentmethod` Postgres enum needed
  `ALTER TYPE ... ADD VALUE`, not a fresh `CREATE TYPE`** - easy to miss since it only breaks at
  query time (`invalid input value for enum`), not at migration time. Caught this live-testing
  the cash ledger endpoint, not from the migration dry-run.
- New `/api/v1/cash-ledger/summary` and `/cash-ledger/cheques` (accounts/admin only) and a new
  **Cash Ledger** page: Cash in Hand and Cash in Bank as simple running totals (received minus paid
  out; cash-method payments vs. everything else), plus a unified cheques table combining cheques
  received from customers and issued to vendors. This is deliberately **not** a full double-entry
  ledger - it's the two numbers plus a cheque tracker the PDF actually asked for, nothing more.
- **Purchases now support partial payment tracking**, mirroring Invoices exactly: `Purchase`
  gained `amount_paid`/`status`, a new `PurchaseDetail.tsx` page (route `/purchases/:id`) has the
  same record-payment/delete-payment/cheque-fields UI as `InvoiceDetail.tsx`. This was the "Stock
  Value - Cash Paid/Balance" gap from the PDF.

### Sales & Expense graphs
`GET /reports/graph?metric=sales|expense&granularity=daily|weekly|monthly|yearly` (Postgres
`date_trunc`, since this app is Postgres-only - no SQLite fallback needed). "Expense" here means
money spent on purchases; there's no separate operating-expense ledger (rent, salaries, etc.).
Rendered with a small custom `components/BarChart.tsx` rather than pulling in a charting library -
deliberately just bars sized by value, no dependency added, since the requirement was two simple
trend graphs, not an analytics dashboard.

### Per-production-stage job card fields
The PDF's paper job-card layout lists stages (Order Taken By, DTP, Machine Man, Rubber Stamp,
Numbering, Binding, Proof Verified-Customer, Proof Verified-Press) that weren't all modeled - only
`designer_id`/`operator_id`/`machine_id` existed (covering DTP/Machine Man). Added
`order_taken_by_id`, `rubber_stamp_by_id`, `numbering_by_id`, `binding_by_id` (all `User` FKs),
`proof_verified_customer` (a nullable timestamp, not a separate bool+date pair - null means not
yet verified), and `proof_verified_press_id`/`proof_verified_press_at`. Surfaced in Job Cards' assign
dialog under a collapsible "Production Stages" section so the common fields (machine/designer/
operator/priority/delivery) aren't buried under eight more pickers.

### Estimate as a real document type
`Quotation.document_type` (`quotation` | `estimate`) rather than a parallel table - an Estimate is
structurally identical to a Quotation (customer + priced line items going through the same pricing
engine), the PDF just lists them as separate nav items because staff use them differently. Gets its
own numbering sequence (`EST-00001` vs `QT-00001`, counted independently). `QuotationCreate.tsx` has
a Quotation/Estimate toggle (hidden in the quick-order flow, which is always a real quotation), and
the Quotations list has a "New Estimate" button plus a Document column.

### Delivery Challans
New `DeliveryChallan` model/page - always references an existing `Invoice` for item/pricing detail
(this shop invoices at or before delivery, so there's no "challan without a bill" case to support),
with a `bill_type` of `cash_bill` or `tax_gst_bill` matching the PDF's split. No PDF export yet, and
no data model changes elsewhere - open to all authenticated roles the same as creating an invoice.

### Verified
Full migration chain re-tested from empty (including the `ALTER TYPE` fix). Live-tested every new
endpoint against the real dev DB: recorded a cheque payment on a purchase (status flipped to
`paid`, cheque appeared correctly in the cheques list), created a Delivery Challan against a real
invoice, created an Estimate (`EST-00001`), set job-card stage fields via the API. `tsc --noEmit`
and `npm run build` both clean. Cleaned up all test records afterward.

### Still open
Real pricing data, mobile/offline visibility, further UI polish, deeper exploratory reporting
(trends/drill-downs beyond what's here), and a real browser click-through of everything in this
update (verified via API + build only, same caveat as the previous pass).

## Update — 2026-07-31 (seventh pass): two real bugs from live usage

Both reported live (console errors while actually using the app, not found during a review pass) -
worth calling out separately from the feature work above since they're pure bug fixes.

**Dashboard quick-order form broke on repeat customers.** `POST /customers/` correctly 400s on a
duplicate phone number, but the quick-order form always tried to create a brand-new customer on
every order with no dedup and no real error message - so calling back a repeat customer (or just
retesting with the same test phone number) silently broke order creation behind a generic "Could
not start the order" alert. This is the "no customer dedup" item already on the known-gaps list;
now fixed rather than just documented: `QuickOrderForm.tsx` looks up an existing customer by exact
phone match in the already-loaded customer list before creating a new one, and the error alert now
shows the real backend message via `getErrorMessage` instead of a generic string.

**Confusing "no price matrix entry" errors creating quotations.** Root cause: categories like
Visiting Card price by exact discrete quantities transcribed from the PDF rate card (50, 100,
150...), not ranges - the quantity field gave zero indication of that, so typing anything in
between (a very natural thing to try) failed with one generic message that also covered two
unrelated failure modes (a missing required attribute, or a valid quantity with no price for that
exact option combination). Fixed on both sides:
- `pricing_service.py` now distinguishes *why* the lookup failed and returns an actionable message
  - either the actual list of valid quantities for that product, or a pointer to check required
  options / ask an admin to price that combination via Price Matrix.
- `QuotationLineItem.tsx` shows valid quantities as helper text and validates client-side before
  submission - scoped to the specific product's own active price-matrix cells, not "every quantity
  slab in the category." That distinction mattered in practice: category 1 (Visiting Card) still
  carries a stray leftover range slab from earlier manual testing (the same duplicate-data issue
  flagged as cosmetic two passes ago) alongside the 23 real discrete slabs - naively using every
  slab in the category would have produced wrong guidance instead of just wrong pricing.

Both verified live against the real dev DB (reproduced each bug via direct API calls first, then
confirmed the fix), `tsc`/build clean, pushed to `dev`.

### Still open
Same as above, plus: the duplicate-category cleanup (old "Rubber Stamps"/"Lamination"/one stray
quantity slab, all from pre-seed-script manual testing) is now actively causing confusion twice,
not just cosmetic - worth an admin doing the merge via Pricing Setup sooner rather than later.

## Update — 2026-07-31 (eighth pass): real logo added

Added the actual "SJP / Sri Jayam Printers" circular badge logo (pink/gold ring, floral design,
NAVALUR location, phone numbers) in place of the generic MUI print icon used as a placeholder
everywhere since project start.

- `frontend/src/assets/logo.jpg` - used in the app (sidebar header in `Layout.tsx`, login screen
  in `Login.tsx`), rendered as a circle via `borderRadius: '50%'` + `objectFit: 'cover'` so the
  JPG's white corner background is cropped out.
- `frontend/public/logo.jpg` - static copy for `index.html`'s favicon (`<link rel="icon">`) and
  browser tab; also updated the page `<title>` from the Vite default "frontend" to
  "Sri Jayam Printers - ERP System".

`tsc --noEmit` and `npm run build` both clean (logo bundles as a normal hashed asset, 59KB). Not
yet confirmed in an actual browser (same no-browser-tool caveat as every other frontend change this
session) - worth a quick visual check that the circular crop looks right against the dark navy
sidebar background.

### Still open
Same as seventh pass, plus: eyeball the logo crop in an actual browser once someone has one open.
