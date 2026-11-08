# Sri Jayam Printers ERP - what changed in round 3 (November 2026)

This round answers the client's 12 comments and puts the shop's own price lists into the system. Everything below is on the
dashboard, the order page, Pricing Setup, the job card and the bills.

## 1. Dashboard: shorter order form, live jobs on top

* **Statistics** are now one slim strip (Customers, Quotations, Job Cards, Invoices) instead of four big boxes.
* **Start New Order** is much shorter. The **Service** comes first, as big tiles with a search box (type "sticker" to narrow them).
  Customer, bill type and the proof / delivery dates sit in compact rows. Company, e-mail and address are under **More details**.
* **Live Jobs** (right-hand side, first thing on a phone) lists the running jobs with their status:
  * every job is **clickable** and opens that job;
  * each job shows its **status** (Waiting to start, Design, Proof approval, Printing, Binding / finishing, Packing & handover, Delivered),
    a five-step progress strip, who has it now, the proof to watch and the delivery date (red when late);
  * the seven status chips at the top show how many jobs are in each; click one to see only those;
  * filters: **Running**, **Urgent**, **Overdue**, **Delivered**, **All**. The board refreshes itself every 20 seconds.

## 2 and 3. Paper of every copy (Bill Books and similar)

On the bill book order each copy of the set (**Original, Duplicate, Triplicate ...**) now has the same four choices:
**Paper name, GSM / grade, Paper size, Colour**. The Original copy is first; the other copies start as "same as the Original".
Every copy is priced in its own GSM (and size). The paper, GSM and size of **every** copy are printed in the invoice
particulars and listed on the job card in a table.

## 4. Printing charge by quantity (editable)

**Pricing Setup > Printing & Tax > "By quantity bands"**. Each service has a table of bands, e.g.

| From | To | Charge | For each block? |
|---|---|---|---|
| 1 | 1,000 | ₹500 | no |
| 1,001 | no limit | ₹2,000 | yes, per 1,000 |

meaning "up to 1,000 pages ₹500; above that ₹2,000 is added for each started 1,000". Change any amount and the order page uses it
at once (for example a band 1,001 to 2,000 at ₹200). For Bill Books every copy of a set counts as a printed page
(1,000 sets of 1+3 copies = 4,000 pages). The shipped bands keep today's prices (₹500 per 1,000); enter the client's
figures in the table.

## 5. Names on the order page

The page is **New Order: Invoice & Job Card** and the button **Generate Invoice & Job Card**.

## 6 and 11. Rates explained, with links to Pricing Setup

* The order page has a link **Check / change the prices in Pricing Setup** (opens in a new tab, so the order is not lost).
* Beside every rate (order page, quotation, invoice) the **Why this rate?** button lists each part of the price:
  paper rate (band and rate), each copy's paper, option extras, every extra charge, the printing charge and its band, any minimum charge -
  each with a link to the setting it came from. The breakdown is saved with the order, so it can be read later exactly as it was.

## 7. Design proofs and live monitoring

Proof 1 and Proof 2 of the order become **proofs of the job card**. On the job card and the tracking page you can **add as many
proofs as needed** (Proof 3, 4 ...), set each one's status (Not shown yet / Shown to the customer / Approved / Changes asked), the due
time and **who is looking after it**. The dashboard shows the proof to watch for every running job (late proofs in red).

## 8. Urgent jobs

Tick **Mark urgent** on the dashboard form (or the **Urgent** switch on the job card). Urgent jobs are bold with a red **URGENT** badge,
come first on the dashboard board and in the Job Cards list, and the printed job card carries a red "URGENT - HANDLE FIRST" bar.

## 9. The job card

The job card page now starts with the live card, built from the order:
status and all stages, who has it now, customer, item, quantity, delivery, **every option chosen** (GSM, size, sides, finish ...),
the paper of each copy, extras (including custom ones), instructions, the proofs, and (if wanted) the price breakdown.
**Print without price** / **Print with price** make an A4 job card with the status as it is right now - print it again whenever it changes.
The hand-written paper job card is still below it.

## 10. Visiting cards

* No duplicate Item / Size box when a service has a single item (the service is shown once as the heading).
* **Minimum order quantity** is set on the product (**Products > edit > Minimum order quantity**); Visiting Card = 50. The order page
  starts at that number and refuses less.

## 11 (second). Discount

On the order page: **Discount (optional)** - none, **percentage** or **amount**. It comes off the total before GST, is spread over the
lines so each line's GST is right, and is shown on the invoice, the cash bill, the GST bill and the quotation.

## 12. Visiting card extras

The extras (Design, Corner cutting, Foiling) are **required dropdowns**: *None*, one of the options, or *Custom...* (type a name and an
amount). The order cannot be generated until every one is answered. The amounts come from Pricing Setup > Extra Charges. The owner
can turn this behaviour on for any service with the switch on that tab and can group charges into sections there.

## The shop's price lists

Entered from the poster "Price List w.e.f. 01-05-2026" and the "All media - customer rates" sheet:

* **Xerox**: A4 B/W ₹2 a page at any quantity; A3 B/W ₹4 / ₹7 (one side / both); colour ₹12 / ₹23; other sizes scaled.
* **Printout**: A4 B/W by number of pages (1st print ₹5, "2-3 prints" ₹10 for the lot, then ₹2.00 down to ₹1.00 a page),
  colour printouts, A3, ID copies, scanning, spiral / comb / soft binding by thickness.
* **Board & Paper Printing (13x19)** (new service): a **Master** rate for the first sheet and an **Additional** rate for every further sheet
  (e.g. 300 GSM art/matt board ₹30 then ₹19.50 each), for 16 boards and papers.
* **Stickers**: sticker sheets (Master / Additional), sticker with scoring 13x19 and A4. The old test items are switched off.
* **Lamination** (boards and stickers): cold ₹100 a board; thermal ₹7.50 a board with a ₹150 minimum (20 boards).

Readings of the lists to confirm with the client (all editable in Pricing Setup):
1. "2-3 print ₹10" is taken as **₹10 for the lot** (so 4 or 5 prints are held at ₹10: a bigger order never costs less than a smaller one).
2. "Master" is the price of the first sheet, "Additional" of every further sheet.
3. Thermal lamination "minimum 20 boards ₹150" is ₹7.50 a board, never less than ₹150.
4. Xerox A4 double side (not on the poster) is ₹3.50.
