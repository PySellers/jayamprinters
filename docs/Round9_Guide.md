# Sri Jayam ERP - client round 9 (version 1.5.0)

The client's enhancement request (`docs/Jayam Printers Enhancement.pdf`, 8 points). What each point means, how it was built and how to try it.

| # | Request | Where | What happens now |
|---|---|---|---|
| 1 | Separate **Customer Name** in Order Creation > Customer | Dashboard > Start New Order | A visible *Customer Name* box next to *Billing Person Name* (it used to be a hidden "Company Name" under More details). The customer name is what the bill and the job card print; blank = the billing person's name. Both are saved on the customer. |
| 2 | **Editable final billing total** | Order screen (under the total), Edit invoice | *Final amount (optional)*: type what the customer will really be billed. The difference to the calculated total is kept as **Round off / adjustment** (+ or -) and flows to the price panel, quotation, invoice, advance / balance, GST invoice, cash bill, A4 invoice, receipt and quotation PDF. The arrow beside the box goes back to the calculated total. GST stays as calculated; only the final total changes. |
| 3 | **Credit / Debit** menu | Sidebar > Credit / Debit | Two entry forms (Name, Amount, Note, Date - today by default) and two tables (Credit, Debit) with Date / Name / Amount / Note. Filters by name and by date range; totals and *balance by name* follow the filter; edit with the pencil, delete for Admin / Accounts, **Download Excel** (credit sheet, debit sheet, balance by name). Roles: Admin, Accounts, Counter (production staff do not see it). |
| 4 | **Edit** in the GST invoice | Invoices > Edit (and the Edit button inside an invoice) | Window with customer name / phone / address / GSTIN, invoice date and every row: particulars (several lines), HSN / SAC, qty, rate, CGST %, SGST %. Amount, CGST, SGST, row total and grand total are worked out again while typing (on the server, so the window, the saved invoice and the PDF always agree). Rows can be added or removed; a final amount can be typed. The order's discount is kept (taken off before tax, as before). Saving updates the invoice, its PDFs and the print; the invoice records who edited it and what changed. The customer's own record is not touched. Money already received is protected: the new total cannot be lower than the receipts (the invoice becomes *partly paid* if it grows). Cash bills can be edited too (no HSN / GST columns). |
| 5 | **GST invoice print**: bigger fonts, prominent totals | Invoices > View / Download | Larger lettering throughout (rows 9.5 pt, particulars 8.4 pt, header cells 9-9.5 pt, party box larger), 12 rows per page instead of 15 so rows are taller, and **Grand TOTAL**, **Total Amount After Tax** (and **Balance Due**) in dark bands with 14 pt figures. Same layout and GST logic as before. |
| 6 | **Edit job card**, with and without price | Job Cards > pencil (Edit job card) | The job card form is the editor: party, mobile, job name, size, type of printing, proof dates / times, delivery date / time, paper details, printing colour, margin, serial / book numbers, remarks. For the copy with price the **price list can be edited** too (change a line, add, remove; "Use total as Bill total"; "Back to the order's list"). What is saved is what both job cards print (and the list's Delivery column follows). |
| 7 | **A5 print** for both job cards | Print buttons everywhere | The paper job card and the detailed job card, each with and without price, print on **A5 landscape**. The form is laid out on a slightly larger canvas and scaled onto the page (text still about 7 pt): nothing overlaps or is cut off - the colour / margin block grows to hold its tick boxes, long remarks shrink to fit (or say "more notes on the job detail screen"), a long price list folds its last lines into one "Other (n lines)" line, the detailed card flows over further pages with its section headings kept with their first row. `?size=a4` still gives the old full sheet. |
| 8 | **Wedding Invitation** Screen Print / Offset | Start New Order > Invitation & Greeting Cards | *Screen Print* item: **Screen Print** (Wedding Invitation, House Warming, Baby Shower, Birthday, Custom - typed) and **Method** (Invitation, Thamboolam Bag, Visiting Card, Pen, Diary, Custom - typed); Paper/Board Type has **Nil**. *Offset* item: **Size** (A5, A4, Custom - typed). Both items: typed **Printing Charge** and **Card Amount**; total = card amount + printing charge, the same on the price panel, quotation, billing summary and invoice. The new drop-downs show only for their own item. A typed "Custom" text replaces the word Custom on the job card, bills and quotation. |

## Readings of the request (to confirm with the client)

* **Card amount** can be typed *per card* or *for the whole order* (a switch beside the box); the client's PDF only said "Card Amount". Printing charge is for the whole order.
* **Round off** is stored as an adjustment on the order, so the original calculated amount is always visible.
* The **A5** request is applied to the printed job cards (the paper job card and the detailed one); the screen form is unchanged.
* **Credit / Debit** is a simple book of entries by name (no link to invoices or the cash ledger).

## Admin setup

* Pricing Setup > Items: the switch *Counter types the Card Amount and Printing Charge (invitations)* turns the typed amounts on for any item.
* Pricing Setup > Attributes: *Shown for* limits a drop-down to one item of the service (chip "Only: ...").
* `seed_round9.py` (run once after `alembic upgrade head`) creates the Screen Print / Method / Size drop-downs, the Nil paper option and switches typed amounts on for the two invitation items. It is idempotent.

## Technical notes

* Migration `u1f3h5j7l9n0`: `quotations.adjustment_amount`, invoice bill-to fields / edit audit / adjustment, line fields (card amount, mode, manual printing charge, option texts, particulars, CGST / SGST), `invoice_items.product_id` nullable (free rows), `products.allow_manual_amounts`, `attributes.product_id`, tables `credit_debit_entries` and `invoice_edits`.
* API: `GET /invoices/{id}/edit-form`, `POST /invoices/{id}/edit/preview`, `PUT /invoices/{id}/edit`; `/credit-debit/entries|names|summary|export`; `final_amount` on quotation create / preview; `size=a4|a5` on `/job-cards/{id}/pdf` and `/sheet-pdf`; `price_lines` in `PUT /job-cards/{id}/sheet` (omitted = keep, `null` = back to the order's list).
* Tests: `uat_tests/t_round9.py` (API, 36) and `ui_round9.mjs` (browser, 30).
