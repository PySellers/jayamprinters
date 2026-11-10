# Sri Jayam ERP - client round 5 (Nov 2026)

Version **1.3.0**. The client's 17 points, where each one is, and what to know before using it.

| # | Request | Where / what |
|---|---|---|
| 1 | Home page = order placement; Live Jobs as a big red button | Dashboard opens on the order form. The red **Live Jobs (n)** button replaces the Customers button; it switches the page to the Live Jobs board (every job, one page) and then reads **Order online** to switch back. The right-hand job board is gone from the order page. |
| 2 | Customers'/users' phone numbers into the Admin's Google Contacts | *Customers > Export contacts* (Admin): a `.vcf` (open on the phone, or Google Contacts > Import) or a Google `.csv`. All land under the label "Sri Jayam Printers". **A live two-way Google sync needs a Google Cloud OAuth client; it was not built - the file import is the no-setup way.** |
| 3 | Binding extras are mandatory choices | Binding Services extras are two required drop-downs: **Binding Type** and **Leather Binding** (None / option / Custom). Same mechanism as visiting cards (`extras_required`). |
| 4 | Sub-categories for every service (Rubber Stamp sizes) | *Pricing Setup > service > Items & Sub-categories*: add / edit / switch off / delete items and give them a sub-category. The order form asks Sub-category first, then Item / Size. Rubber Stamp is pre-grouped (Polymer Stamp A / B / C / D / X Series, Printer / Dater Stamp, Other Stamps). |
| 5 | Options of every drop-down managed by the Admin | Attributes tab (options of drop-downs) and Extra Charges tab (the Section box now lists the existing sections, so adding another option to "Binding Type" is one click). Custom is always offered in required extras. |
| 6 | More Xerox binding options | Rexine, Tape and Pin Binding added (price 0 until the owner sets it in *Extra Charges*). The Admin can add more the same way. |
| 7 | Paper first after the item, for all services | Paper-like attributes (paper, board, GSM, media, material) come first in the order form; in the bill-book flow the paper of each copy now comes before the quantity. |
| 8 | Invoice format as per the sample, with all particulars | GST invoice and cash bill redrawn on the lavender printed-bill look; each line shows the item with every option chosen, the extras and the notes; Advance Paid / Balance Due added. |
| 9 | Advance captured, totals and bills adjusted | Order screen: *Advance received now* (amount, method, UPI id / bank details / reference, receipt photo). Recorded as a payment marked Advance; bills show Advance and Balance; the job card payment column follows. |
| 10 | Customer's earlier orders under the Generate button | One line per order (date, bill, item, qty, amount, discount, balance) + summary and a tag (New / Occasional / Regular / Very frequent). |
| 11 | Pay later: date and reminder | *Balance will be paid by* on the order screen or the invoice page. Dashboard shows **Payments due** (overdue / today / next 7 days) with a **Remind** button that opens a ready WhatsApp message with the amount. The date prints on the bill. **Reminders are sent by the counter pressing Remind - there is no automatic sending (that needs the WhatsApp Business API).** |
| 12 | Purchases: customer's product, one-time products, low stock | Inventory: *Customer's own material* (per customer, never in the shop's buy list). Purchases: *One-time item* lines are billed but never enter the stock. Job card > *Materials used* takes stock out (and gives it back on removal). Items at / under the reorder level or empty show on the Dashboard ("Stock to buy") and in Inventory (Low / Empty). **Stock is reduced by what staff record under Materials used - it is not worked out from the order's paper automatically.** |
| 13 | Transaction details on sales, purchases, outsource | Every payment: method, reference / UTR, UPI id, bank details and an uploaded receipt (photo / PDF, 8 MB). A paperclip opens it. New table `outsource_payments` (one row per payment). |
| 14 | Paper job card specific to the service | The form and the print show only what the service needs (Xerox / Printout: no ink colours, margins, proofs, copy rows; bill book: a row per copy, margins, numbering; offset: colours and proofs). Price list = the order's price breakdown. *Add proof* for more proof lines. |
| 15 | Paper job card landscape | Both job card prints are A4 landscape. |
| 16 | With price: no steps; proofs + delivery date from the job | The priced print leaves out the production steps and shows the proofs and the job's delivery date (services without proofs show just the delivery). |
| 17 | Account statement; sample invoice / cash bill / challan; chat bot; Print on the list | *Reports > Account statement* (Admin): serial no., date, particulars, debit, credit, balance; per day or week; invoice / purchase counts per group; grand total; Excel. Delivery challan is now a white form with blue outlines (for the yellow paper). Every job card line has a **Print** button. **Help chat** (bottom right of every page). |

## The help chat

* Answers from `backend/app/knowledge/manual.md` - one `## ` section per topic, with `Keywords:` and `Link:` lines.
* It runs inside the application (BM25 ranking over the manual, no outside AI service, no keys, no cost).
* **To "train" it: edit `manual.md`** - the chat reads the file again by itself when it changes. Whenever a feature changes, change its section (a test checks every topic has keywords and a real page).
* It finds the topic that best matches the words of the question; it cannot reason beyond the manual. If an LLM is wanted later, the same retrieval can feed an Anthropic API call (needs an API key).

## For the developer

* Migration `t0e2g4i6k8m9`; seed `seed_round5.py` (idempotent: binding groups + required, rubber-stamp sub-categories, Xerox binding options).
* New endpoints: `GET /customers/{id}/orders`, `GET /customers/export/contacts`, `PATCH /invoices/{id}`, `GET /invoices/dues`, `POST|GET|DELETE /payment-proofs/{kind}/{id}`, `GET|POST /job-cards/{id}/materials`, `DELETE /job-materials/{id}`, `GET /job-cards/{id}/sheet-pdf`, `GET /reports/ledger[/export]`, `POST /assistant/ask`, `GET /assistant/topics`.
* Tests: `t_round5.py` (23 API), `ui_round5.mjs` (`node ui_run.mjs round5`).
* Vite note: if the dev server ever shows a page without a recent change, restart it (the watcher can miss files written by scripts).
