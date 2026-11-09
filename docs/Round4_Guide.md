# Sri Jayam ERP - client round 4 (Nov 2026)

Version **1.2.0**. What changed, where to find it, and how to try it as an ordinary employee.

## 1. Try it as an employee (not Admin)

| | |
|---|---|
| Login | `staff@srijayam.com` |
| Password | the demo password used for the other demo staff (set by `seed_round4.py`; change it from *Profile menu > Edit profile*) |
| Role | Production (can take and finish tasks; no Pricing Setup, Users, Masters or AI Insights) |

The employee belongs to no work center, so they can take **any task nobody has taken yet**. To narrow it down, add them to a work center under *Masters > Work Centers*.

## 2. The points (numbered as in the client's message)

| # | Request | Where / what |
|---|---|---|
| 1 | Session of 3 hours | Sign-in now lasts 3 hours (`SESSION_MINUTES`, default 180). *About* shows it. |
| 2a | Customers / Quotations / Job Cards / Invoices as slim light-blue buttons | Top of the Dashboard; click to open the list. |
| 2b | Job card form pre-filled | *Job Cards > open a job > Printing job card*: party, job, size, type of printing, paper range / GSM / colour / quantity per copy, cutting size, ink colour, proof and delivery dates, remarks (notes + extras), payment column (rate, bill total, advance, balance, price split by stage) and the Job Position ticks. Edit and **Save**, or **Fill again from the order**. Cells you did not touch keep following the order (e.g. a new payment). |
| 4 | Assign / take tasks, visible on Live Jobs | *Job card > Tasks & who is working on them*: **Take it** (employee), **Assign / Re-assign** (Admin, Counter). Live Jobs shows `Section: Person · task`, or "not taken yet". |
| 5 | Extra tasks in between | *Add a task*: name, which task it comes after, section, optional person. Admin, Counter, or the employee who holds a task on that job. A new task takes the stage of its neighbour so the job status does not jump. It cannot go in front of finished work, nor onto a delivered job. |
| 6 | Pricing Setup service buttons | Same buttons as the Dashboard, with a search box; `?category=..&tab=..` links still work. |
| 7 | Logo | Top of the left menu (on a white badge so the black letters show). |
| 8 | Footer | "(c) 2026 Sri Jayam Printers. All rights reserved. | Developed by PySellers Services Pvt Ltd, 8838587824". |
| 9 | Employee login | See section 1. |
| 10 | Profile menu | Top right avatar: **Edit profile** (name, phone, password), **Manual**, **Contacts**, **About**, **Logout**. |
| 12 | AI Insights (Admin only) | *Reports > AI Insights*; the whole Reports page (profit statement, sales) is now Admin only: sales by month with a 3-month forecast and range, services (share, growth, speed, discount), employee performance (score, speed vs team, rework), where jobs wait, open jobs likely to miss their date, best / quiet customers, money to collect, busiest weekdays, and written advice with the numbers behind it. Employees get no tab and a 403 from the server. |

## 3. How the AI Insights work

Nothing leaves the system. It is statistics on your own records:

* **Forecast**: straight-line trend through the last (up to 6) full months, widened by how much those months varied; the current month is projected from its pace. Confidence is *low* under 5 months of history.
* **Late-job risk**: for each open job, the longer of (time the remaining steps normally take, at 8-hour days) and (how long this service normally takes from order to delivery), compared with the promised date.
* **Employee score** = speed against the team on the same kind of step (40 %) + amount finished (35 %) + work that was not re-opened (25 %). Only steps people *Take / Start / Done* themselves count, so ask the team to do that.
* **Advice** is rule based (sales trend, one service carrying > 40 %, slow services, heavy discounts, rush share, on-time rate, bottleneck section, one person doing half the work, quiet regular customers, old receivables, outsourcing cost ...). Every point quotes its figures.

## 4. For the developer

* Migration `s9d1f3b5c7e8` (phone on users). Seed `seed_round4.py` creates the employee login (idempotent).
* New endpoints: `PATCH /auth/me`, `POST /auth/change-password`, `GET /auth/contacts`, `GET /auth/about`, `POST /job-cards/{id}/sheet/reset`, `GET /reports/insights?days=` (admin only). `POST /job-cards/{id}/steps` accepts `assigned_to` and an optional `stage`.
* Tests: `t_round4.py` (API), `ui_round4.mjs` (browser, `node ui_run.mjs round4`).
* The AI Insights are in `app/services/insights_service.py`; the pre-fill in `app/services/job_sheet_service.py`.
