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
