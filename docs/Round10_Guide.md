# Sri Jayam ERP - round 9 follow-up (version 1.5.1)

Feedback from the client and the developers after version 1.5.0.

| # | Feedback | What was found | What changed |
|---|---|---|---|
| 1 | Billing Person Name should be a **select option**; add a new person name; remove a name that is not needed | The box only suggested the 8 most recent customers and the matches while typing; there was no explicit add or remove | **Start New Order > Billing Person Name** is a drop-down of every saved name (A to Z, "Person 12" walk-in placeholders left out). Type to narrow it down, choose a name and the customer details are filled in. First line **Add a new person...** opens a small window (name + optional phone), saves the person and selects them. The **cross** beside a name removes it from the list after a confirmation - the customer, orders, bills and history are kept, and the name returns when you place a new order for that person or tick *Show this name in the Billing Person Name list* on the Customers page (new `customers.hidden_in_billing`; migration `v2g4i6k8m0p1`, no seed). |
| 2 | Job card **edit options are not enabled** for both with price and without price | Editing worked for every role, but it was hard to find (the form sat below the tasks panel) and there was only one edit page - no separate "without price" / "with price" | The pencil in the Job Cards list now offers **Edit job card - without price** (shop-floor copy) and **- with price** (office copy). Two buttons at the top of the edit page switch between them. The **form comes first**, tasks / materials / progress are below it. Without price the payment column and the price list are not shown; with price they are, and the price list is editable. A note on the page says which copy is being edited. Verified for admin, counter, production and accounts. |
| 3 | Is the job card sheet **A5**? | Yes: both job cards, with and without price, are A5 landscape (210 x 148 mm) since 1.5.0 | The size is now **written under the card** and the PDF asks the printer to **print at actual size** (choose A5 paper in the print window). The print buttons say "(A5)". `?size=a4` still gives the old full sheet. |

Also: on the Customers page, e-mail / reason / phone are required only when **adding** a customer, so a customer saved from the order form can be edited.

Tests: `t_round10.py` (8 API) and `ui_round10.mjs` (15 browser); the whole suite 1145 / 1145.
