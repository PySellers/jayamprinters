# Sri Jayam Printers — Project Handoff

Status as of 2026-07-28. Read this first, then dig into the two linked docs below for detail.

## What this repo contains

```
srijayam-printers-site/
├── index.html, services.html, gallery.html, contact.html, quote.html, assets/
│     The original static marketing site. Not touched in this build — still live as-is.
├── Sri_Jayam_Printers_ERP_Blueprint.docx
│     The requirements/architecture doc: business analysis from the shop's rate-card PDF,
│     MNC-benchmark comparison, data model, system architecture, tech stack, phased roadmap.
│     Read this for WHY things are built the way they are.
└── erp-pricing-engine/
      The actual application (FastAPI backend + two web frontends). Read this for HOW to
      run it and WHAT'S in each module — erp-pricing-engine/README.md is the runbook.
```

Branches: `main` and `dev` currently point at the same initial commit. Suggested convention going
forward — build features on `dev`, open a PR into `main` when stable. Neither branch has protection
rules configured yet on GitHub; set those up if you want to require review before merging to `main`.

## What's actually built and working

A runnable FastAPI + SQLAlchemy backend (`erp-pricing-engine/app/`) plus two frontends
(`erp-pricing-engine/web/`), covering:

- **Full product catalog** — all 16 categories from the rate-card PDF, each with its real
  attributes (size, paper, GSM, lamination, binding, etc.), quantity slabs, and extra charges.
  Rubber Stamp — Polymer has real transcribed prices; every other category prices off a
  **placeholder rate** (clearly marked `# PLACEHOLDER` in `app/seed_data.py`) since the source PDF's
  price cells were blank templates.
- **Pricing engine** — one resolver (`app/pricing_engine.py`) used identically for quote preview,
  job cards, and multi-item orders, so a quoted price and a billed price can never drift apart.
- **Orders & Job Cards** — checkout bundles multiple product lines into one Order, each becoming a
  Job Card tracked through Order Taken → DTP → Proof (Customer) → Proof (Press) → Printing →
  Finishing → Dispatched, with named staff attribution per stage.
- **Role-based auth** — 4 roles (admin / counter / production / accounts), enforced per-endpoint.
  Built with plain Python stdlib crypto (no external JWT library was installable in the sandbox this
  was built in) — functionally real RBAC, but see the Known Gaps section below before trusting it
  with real credentials.
- **Accounts/Finance module** — cash ledger, cheque lifecycle, vendor bills, low-stock inventory.
- **Reporting** — daily/weekly/monthly/yearly sales and expense charts, computed in pure Python so
  the same code works on SQLite (dev) and Postgres (production) without rewriting queries.
- **Reminders** — overdue/due-soon deliveries and unpaid order balances, surfaced on the dashboard.
- **Customer storefront** (`web/storefront.html`) — installable PWA: browse catalog, configure a
  job with live pricing, cart, checkout, online order, track by order number.
- **Staff dashboard** (`web/admin.html`) — login-gated: Home (order intake + reminders + job
  status), Job Board (kanban), Orders (payment/cancel), Reports, Accounts, Catalog Admin
  (admin-only price/option editing), Parties.

Everything above compiles and runs; there is no automated CI yet (see Known Gaps).

## Known gaps / what's next — hand these to whoever picks this up

Roughly in priority order:

1. **Real prices.** This is the big one. Go through `erp-pricing-engine/app/seed_data.py`
   category by category and replace placeholder `PriceMatrixCell` rates with the shop's actual
   numbers. Once real prices exist, the Catalog Admin screen in `admin.html` lets non-technical
   staff maintain them going forward without touching code.
2. **Merge into the real project, not this standalone scaffold.** This repo runs on its own
   (SQLite, its own auth). The intent was always to fold `app/models.py`, `app/pricing_engine.py`,
   `app/schemas.py`, and the routers into the shop's actual FastAPI project (the one with the
   existing customer CRUD /dashboard mentioned at project kickoff), pointed at the same Postgres
   instance, reusing its existing auth instead of the stdlib scaffold auth here.
3. **Auth hardening.** Before any real credentials touch this: change the 4 seeded dev passwords
   (`admin/admin123` etc.), move the HMAC signing secret out of source into an env var/secrets
   manager, add token expiry + refresh, and rate-limit `/auth/login`.
4. **Database migrations.** Currently `Base.metadata.create_all` — fine for a scaffold, not for
   production. Add Alembic before this goes near real data, otherwise every schema change means
   deleting and re-seeding the database.
5. **No automated tests wired into CI, no payment gateway, no GST-compliant invoice PDFs, no
   SMS/WhatsApp notifications.** All Phase 4/5 items in the blueprint doc — not started.
6. **No native mobile/desktop app.** The storefront is a responsive installable PWA (works like an
   app via "Add to Home Screen," no app store). A true native build is a separate project.

## How to run it locally

See `erp-pricing-engine/README.md` for the full runbook (setup, running, sample API calls, and a
more detailed list of honest scope caveats). Quick version:

```bash
cd erp-pricing-engine
pip install -r requirements.txt --break-system-packages   # or use a venv
python main.py                                             # http://localhost:8000/docs
```

Then open `erp-pricing-engine/web/storefront.html` and `erp-pricing-engine/web/admin.html` directly
in a browser — both talk to `http://localhost:8000`, so keep that terminal running. Dev logins for
the admin dashboard: `admin/admin123`, `counter/counter123`, `production/production123`,
`accounts/accounts123` — change these before anyone outside the two of you touches it.

## Suggested next steps for whoever picks this up

- Read this file, then `Sri_Jayam_Printers_ERP_Blueprint.docx`, then `erp-pricing-engine/README.md`,
  in that order.
- Run it locally first (above) to see the current state before changing anything.
- Pick an item from "Known gaps" above — real pricing data entry is the highest-value, lowest-risk
  place to start and doesn't require understanding the codebase deeply.
- Work on `dev`, open a PR into `main` so changes get a second pair of eyes before landing.
