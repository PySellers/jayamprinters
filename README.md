# Sri Jayam Printers ERP

A cloud-based ERP for a multi-service printing business: customer management, a configurable
attribute-driven pricing engine, quotations, job-card production tracking, and billing/invoicing
with PDF export.

## Tech Stack

### Backend (`backend/`)
| Layer | Technology |
|---|---|
| Framework | FastAPI (Python) |
| ORM | SQLAlchemy |
| Database | PostgreSQL |
| Migrations | Alembic |
| Auth | JWT (python-jose) + passlib (pbkdf2_sha256) |
| Validation | Pydantic v2 |
| PDF generation | ReportLab |

### Frontend (`frontend/`)
| Layer | Technology |
|---|---|
| Framework | React 18 + TypeScript, built with Vite |
| UI kit | MUI (Material UI) v9 |
| Routing | react-router-dom v7 |
| Forms | react-hook-form |
| Server state | @tanstack/react-query |
| HTTP client | axios |

## Project Structure

```
backend/
  app/
    api/        # FastAPI routers, one file per resource
    models/     # SQLAlchemy models
    schemas/     # Pydantic request/response schemas
    services/   # Business logic (pricing engine, quotation/invoice/job-card workflows, PDF)
    core/       # config, db session, auth dependency
  migrations/   # Alembic migrations

frontend/
  src/
    pages/          # Route-level page components
    components/     # Shared UI (layout, pickers, dialogs) + feature-scoped subfolders
    api/            # Thin per-domain API client modules
    types/          # TypeScript types mirroring backend schemas
    context/        # Auth context
```

## Modules Implemented

- **Auth** — JWT login; every API route (except `/auth/login`) requires a valid Bearer token via a
  `get_current_user` dependency applied at router-mount time in `main.py`.
- **Customers** — full CRUD + search.
- **Product & Pricing Engine** — a generic, attribute-driven pricing model (not a fixed rate table):
  - `ProductCategory` → `Attribute` (category-scoped, e.g. "Lamination") → `AttributeOption`
    (e.g. "Gloss", "3D" with its own cost delta)
  - `QuantitySlab` — reusable per-category quantity bands
  - `PriceMatrixCell` — a rate for one exact combination of attribute options + a quantity slab
  - `ExtraCharge` — opt-in add-ons (flat / per-unit / per-sqft / percentage), independent of attributes
  - `Product.pricing_type` dispatches between **matrix** (attribute+quantity based), **fixed**
    (flat SKU price, e.g. rubber stamps), and **per_area** (rate × sq.ft, e.g. banners)
  - Admin UI at `/pricing-setup` (attributes/slabs/extra charges) and per-product `/products/:id/price-matrix`
- **Quotations** — dynamic line-item form (attribute pickers render per selected product's category),
  server-computed pricing, status workflow (draft/sent/approved/rejected/converted).
- **Job Cards** — one per quotation line item on conversion; machine/designer/operator assignment,
  production status tracking.
- **Invoices & Payments** — generated from a converted quotation (snapshots pricing so later rate
  changes don't alter historical documents), partial/full payment recording, PDF download.

## Local Setup

### Backend
```bash
cd backend
python -m venv venv
venv\Scripts\activate          # Windows
pip install -r requirements.txt
# Create backend/.env with DATABASE_URL, SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES
alembic upgrade head
uvicorn app.main:app --reload
```
API docs: `http://localhost:8000/docs`

### Frontend
```bash
cd frontend
npm install
npm run dev
```
App: `http://localhost:5173`

## Known Gaps / Next Steps

- **No RBAC** — any authenticated user can access everything; no role field on `User` yet.
- **`SECRET_KEY`** in `.env` is a placeholder — rotate before any real deployment.
- **No automated test suite** — all verification so far has been manual (curl + live browser checks).
- **No rate limiting or audit logging.**
- Frontend admin UI for entering the full rate card is functional but still basic (no bulk import).
- PDF export exists for Invoices only — Quotation/Job Card PDFs not yet built.
- No Estimate or Delivery Challan document types yet (Quotation → Job Card → Invoice is the current chain).
- No mobile app, no scheduled jobs (delivery/payment reminders), no accounts/inventory ledgers —
  all separate, larger phases per the project roadmap.
