# Sri Jayam Printers ERP - help knowledge base

This file is what the help chat (bottom right corner of every page) answers from. To teach the chat something new, add or
change a section here: a line starting with "## " is a topic title, "Keywords:" lists words people may use for it, "Link:" is
the page to open. The chat reads this file again by itself whenever it changes - no other step is needed. Keep it in step with
the application: whenever a feature changes, change its section.

## Signing in and session time
Keywords: login, log in, sign in, password, session, expire, logged out, 3 hours, forgot password
Link: /dashboard
Open the website and sign in with the e-mail and password the Admin gave you. You stay signed in for 3 hours; after that the sign-in page appears again and you sign in again. To change your password open the profile button (your initials, top right) and choose Edit profile. If you forgot your password ask the Admin to set a new one in Users.

## The profile button (Edit profile, Manual, Contacts, About, Logout)
Keywords: profile, avatar, logout, log out, edit profile, change password, phone number, my details
Link: /profile
At the top right is a round button with your initials. It opens a menu: Edit profile (your name, phone number and password), Manual (the user guide), Contacts (the Admin and every employee with phone numbers), About (version and support contact of PySellers Services) and Logout.

## The Dashboard and the Live Jobs button
Keywords: dashboard, home, live jobs, live job, red button, job board, running jobs, order online, home page
Link: /dashboard
The Dashboard opens on the order form (Start New Order). In the strip at the top the big red "Live Jobs" button shows how many jobs are running. Click it and the page changes to the Live Jobs board, with every job in one page and its status, the person who has it, and its due date. The button then reads "Order online"; click it to go back to the order form. The blue buttons Quotations, Job Cards and Invoices next to it open those lists.

## Live Jobs board - statuses, urgent, overdue
Keywords: live jobs, status, urgent, overdue, stage, who is working, filter, search job, not taken yet
Link: /dashboard
Each job shows its stage (Design, Proof approval, Printing, Binding / finishing, Packing & handover, Delivered), who has it now and which step. If nobody has taken the step it says "not taken yet". Urgent jobs are red and listed first. Overdue jobs show OVERDUE. Click a stage chip to see only the jobs in that stage; use the search box for a job number, customer or product. Click a job to open its tracking page. The board refreshes by itself every 20 seconds.

## Taking an order (Start New Order)
Keywords: new order, order, place order, start order, quotation, service, customer phone, item, generate invoice
Link: /dashboard
On the Dashboard choose the Service button (use the search box to find it), type the customer's phone number (saved customers fill in by themselves, new ones are saved), then press Start. On the next screen choose the item and the options, set the quantity, choose the proof and delivery dates and press "Generate Invoice & Job Card". The invoice and the job card are created together and the job starts moving through its steps.

## Order options order - paper first, sub-category, item
Keywords: paper, paper first, options order, sub category, subcategory, size, item, rubber stamp size, gsm, option
Link: /dashboard
After the service, services that have sub-categories (for example Rubber Stamp: Polymer Stamp series, Printer / Dater Stamp) first ask for the Sub-category and then for the Item / Size. Then the Paper (paper name, board, GSM, paper size) is asked first, before the other options such as colour, sides and finishing, because the paper decides most of the price. Fields marked with * must be answered.

## Extra charges are required choices (None, option or Custom)
Keywords: extra charges, extras, binding type, finishing, none, custom, mandatory, required choice, checkbox, lamination, foiling
Link: /dashboard
For services such as Binding Services and Visiting Card the extras are not tick boxes. Each extra (for example Binding Type, Leather Binding, Corner cutting, Foiling) is a drop-down that must be answered: choose None if the customer does not want it, one of the listed options, or Custom to type your own description and amount. The order cannot be saved until every one of them is answered.

## Binding options and adding more binding types
Keywords: binding, spiral, rexine, wiro, hard binding, soft binding, binding option, add binding, new binding type, project binding, tape binding
Link: /pricing-setup
Binding types are listed under Extra Charges of the service (Xerox / Photocopy has a Binding section; Binding Services has Binding Type and Leather Binding). To add one, the Admin opens Pricing Setup, picks the service, opens the Extra Charges tab, presses Add and types the name, the section it belongs to (for example Binding), the price and how it is charged (per set, per piece or flat). It appears in the order form at once. Use Custom in the order form for a one-off.

## Managing sub-categories and items of a service
Keywords: sub category, subcategory, items, add item, size, rubber stamp, manage items, product, sizes, new size, add size
Link: /pricing-setup
In Pricing Setup choose the service and open the Items tab. Each item (a size or variant) has a name, a sub-category, a price type, a fixed price, a minimum quantity and an on/off switch. Type the same sub-category name on several items to group them. The order form then asks for the sub-category first and the item next. Use this for Rubber Stamp and for any other service.

## Managing the options of a drop-down (attributes)
Keywords: attribute, options, dropdown, drop down, add option, paper name, colour option, manage fields, field options, edit options
Link: /pricing-setup
In Pricing Setup choose the service and open the Attributes tab. Each attribute (Paper Size, Colour, Print Side, Binding Material ...) is a drop-down of the order form. Add an option, rename it, set an extra price, or switch it off, and the order form shows the change immediately. The same page manages quantity slabs, extra charges and the printing charge and GST of the service.

## Pricing Setup (rates, slabs, extra charges, printing and GST)
Keywords: pricing setup, price, rate, slab, quantity slab, minimum charge, printing charge, gst, hsn, change price, set price
Link: /pricing-setup
Only the Admin can open Pricing Setup. Choose the service button, then use the tabs: Attributes (the options and their extra prices), Quantity Slabs (the price bands), Extra Charges (finishing and binding), Items (sizes and sub-categories) and Printing & Tax (printing charge bands, HSN and GST). "Why this rate?" on an order line shows where its rate comes from and links to the place to change it.

## Discount
Keywords: discount, percentage, amount, offer, less
Link: /quotations/new
In the order screen, below the lines, the Discount box takes a percentage or an amount. It is taken off before GST and printed on the bill. Under it you will see the customer's earlier orders to decide how much discount a regular customer deserves.

## Customer's earlier orders
Keywords: previous orders, earlier orders, history, frequent customer, regular customer, past jobs, order history
Link: /quotations/new
On the order screen, under the Discount box and before the Generate button, a list shows the customer's earlier orders, one line per order: date, bill number, what was ordered, quantity, amount, paid and balance, with a summary (number of orders, total billed, discount given so far). Use it to give a frequent customer a better discount.

## Advance payment when placing an order
Keywords: advance, advance payment, part payment, paid in advance, deposit, balance, token amount
Link: /quotations/new
On the order screen the "Advance received" box takes the amount the customer pays now, the way they paid (cash, UPI, card, bank transfer) and the UPI id, bank details or a photo of the receipt. When the invoice is generated this is recorded as a payment, the bill shows Advance and Balance, and the job card shows the same. More payments can be added later on the invoice page.

## Payment details - UPI, bank transfer, receipt upload
Keywords: upi, bank transfer, receipt, upload, transaction, reference, payment proof, screenshot, neft, gpay, phonepe, utr
Link: /invoices
Every payment (customer invoices, purchases and outsourced jobs) can carry its transaction details: the method, the reference or UTR number, the UPI id, the bank details, and an uploaded photo or PDF of the UPI screen or transfer slip. Choose the method in the payment box and the matching boxes appear. A paperclip shows on a payment that has a receipt; click it to open it.

## Paying the balance later and payment reminders
Keywords: pay later, pay later date, balance, due, reminder, notify, remind, credit, outstanding, promised date, collect
Link: /dashboard
If the customer will pay the remaining amount later, set "Balance will be paid by" (a date) on the order screen or on the invoice page. Payments that are due today or overdue appear on the Dashboard under "Payments due" with the customer, the amount and a Remind button that opens a ready WhatsApp message with the remaining amount. The same date is printed on the bill.

## Invoices, GST bill, cash bill and printing
Keywords: invoice, bill, gst bill, cash bill, print bill, pdf, download bill, a4, thermal, tax invoice, without gst
Link: /invoices
Invoices lists every bill. Open one to print the GST invoice or the cash bill (they follow Sri Jayam's printed bill books: lavender page, logo, customer box, items with HSN, CGST and SGST, totals, amount in words and the shop's bank details), the A4 or thermal version, to record payments and to set the pay-by date. The particulars of each line show the item with every option chosen, the extras and the notes. The bill shows Advance and Balance when an advance was taken.

## Delivery challan
Keywords: challan, dc, delivery challan, delivery note, dispatch, yellow, white challan
Link: /job-cards
In Job Cards press the DC button of a job to make its delivery challan. The printed challan is a white form with blue outlines, meant to be printed on the shop's yellow challan paper. It shows the number, date, the customer to deliver to and the particulars with quantities.

## Job cards list and printing the paper job card
Keywords: job card, print job card, paper job card, printable, print, job sheet, printing job card
Link: /job-cards
In the Job Cards list every row has a Print button at the end of the line: it opens the paper job card ready to print. Next to it are the other buttons (Delivery challan, Track, Assign, Open). The paper job card is printed on A4 landscape and contains only the parts that belong to the job's service.

## The paper job card form is different for each service
Keywords: paper job card, form, fields, xerox job card, copies, proof, ink colour, margin, service specific, dynamic, landscape
Link: /job-cards
The paper job card changes with the service. A Xerox or Printout job shows paper, GSM, colour, copies, sides and the payment and has no ink colours, margins, proofs or 1st/2nd copy rows. A bill book shows a row for every copy, margins and serial and book numbers. Offset services (visiting cards, invitations ...) show ink colours and proofs. You can add more proof lines (Proof 3, 4 ...) with their date and time. The price list on it is the price breakdown of the order, and is only printed when you choose Print with price.

## Print with price and without price
Keywords: with price, without price, price, job card price, steps, production steps, delivery date, proofs
Link: /job-cards
"Print without price" is for the shop floor: it lists the production steps. "Print with price" is for the office: it shows the price breakdown, advance and balance and leaves out the production steps; the design proofs and the delivery date are taken from the job itself. Both print on A4 landscape and show the status as it is now.

## Tasks, taking a task and assigning an employee
Keywords: task, take task, assign, employee, work, who is working, step, my work, take it, reassign
Link: /job-cards
Open a job card and look at "Tasks & who is working on them". An employee presses Take it on a task and the task is assigned to them; the Live Jobs board then shows their name. The Admin or Counter can Assign or Re-assign a task to any employee. Employees press Start and Done on their own tasks.

## Adding extra tasks to a job
Keywords: add task, extra task, more tasks, in between, new step, extra step, additional task
Link: /job-cards
In the Tasks panel of a job press Add a task, type the name, choose which task it comes after, the section and optionally the person. The new task takes the stage of its neighbour so the job status does not jump. It cannot go in front of work that is already finished.

## Design proofs
Keywords: proof, design proof, approval, send proof, approved, changes needed, proof date
Link: /job-cards
A job's design proofs (Proof 1, Proof 2 ...) have a due date and time and a person looking after them. Mark each one Sent, Approved or Changes needed. The job moves on to printing after the proofs are approved.

## Production workflow, steps and sections
Keywords: workflow, steps, production, sections, work center, work centre, stage, flow, templates, board
Link: /production
Every job follows a list of steps (for example Design, Proof, Printing, Binding, Packing, Delivery). Each step belongs to a section (work center) and is done by one person. The Production Board shows what is waiting in each section. The Admin manages the sections under Work Centers and the step lists under Workflows.

## Work Log - take out one person's work
Keywords: work log, one person, employee work, person wise, individual work, who did what, employee report, work report, each worker, separate, extract, history of work, tasks done by
Link: /work-log
Work Log shows the work of ONE person on its own. The Admin and the Counter open Work Log in the menu, choose the employee (or leave "Everyone" to see one line per employee, then click a name) and choose the days: today, last 7 days, this month or custom dates. The list shows every task that person took, started or finished - job, customer, task, section, started and finished times, how long it took, the notes and the updates they wrote. Filter Finished or Still open, and press Excel to download only that person's work. An employee opens Work Log and sees only their own work.

## Writing your own update on a task
Keywords: update, progress update, add update, my update, note on task, progress note, work update, update my work, daily update, write update
Link: /my-work
Each worker updates their own work separately. Take the task, then press "Add update" on it (in My Work, or in the Tasks panel of the job card) and write what is done so far, for example "printed 600 of 1000". The update is saved under your name in the job's trail and in your Work Log. Only the person doing the task (or the Admin / Counter) can write updates on it. Press Done when the task is finished.

## My Work (employees)
Keywords: my work, my tasks, employee page, production worker, assigned to me
Link: /my-work
My Work lists the tasks assigned to you and the tasks in your section that nobody has taken, so you can Take, Start and Finish them.

## Purchases and stock (inventory)
Keywords: purchase, purchases, stock, inventory, vendor, supplier, paper stock, buy, quantity, reorder, low stock
Link: /purchases
Record what the shop buys in Purchases: choose the vendor, add lines (a stock item, the quantity and the price), and the stock quantity of each item goes up. Inventory lists every stock item with its quantity and its reorder level. Admin and Accounts can add, change and delete purchases and stock items.

## Customer's own material kept in stock
Keywords: customer product, customer material, customer paper, customer supplied, their own paper, bring paper, owner stock
Link: /inventory
When a customer brings their own paper or material, add it in Inventory with "Customer's own material" and choose the customer. It is kept in the shop's stock under the customer's name, is shown separately, and is not counted for the shop's low stock alerts.

## Materials used by a job - stock reduces automatically
Keywords: material used, consume, stock reduce, deduct stock, use stock, materials, job materials, used paper
Link: /job-cards
On the job card, in "Materials used", pick the stock item and the quantity used. The quantity is taken out of the stock at once; remove the line and it goes back. The job card shows the stock still left. A customer's own material is reduced the same way.

## One-time (custom) products in a purchase
Keywords: custom product, one time, one-time, not in stock, special item, custom purchase, bought for one job
Link: /purchases
In a purchase line, choose "One-time item" and type its name, the quantity and the price. It is part of the bill and the expenses but it is not added to the stock, because it is used once for a job.

## Low stock and empty stock alerts
Keywords: low stock, empty stock, reorder, notify, buy more, out of stock, alert, shortage
Link: /inventory
When an item falls to its reorder level or to zero, the Dashboard shows "Stock to buy" and Inventory marks the item Low or Empty. Set the reorder level of each item (paper, binding material ...) in Inventory so you are told in time.

## Outsourced jobs
Keywords: outsource, outsourcing, outside press, vendor job, send out, outside work, margin
Link: /outsource
Outsourced jobs are jobs sent to an outside company. Record the company, what was sent, the cost to us and the price billed to the customer. Payments to the outside company can be recorded with their transaction details and receipt, and the job's progress appears in the job's steps.

## Cash ledger and cheques
Keywords: cash, cash ledger, cheque, cash in hand, bank deposit, daybook, expense, receipt
Link: /cash-ledger
The Cash Ledger (Admin and Accounts) is the hand-entered daybook: receipts, payments and bank deposits give Cash in Hand and Cash in Bank. Cheques issued and deposited are tracked with their status.

## Reports - financial statement and account statement (Admin only)
Keywords: reports, report, profit, statement, balance sheet, per day, per week, debit, credit, account statement, bank statement, ledger, sales report
Link: /reports
Reports is for the Admin only. The Financial statement shows sales, purchases, outsourcing, other expenses and profit per day, week or month. The Account statement is like a bank statement: one line per transaction with a serial number, date, particulars, debit, credit and running balance, grouped by day or week with the number of invoices and purchases of each group and a grand total at the end. Choose "Sales and purchases" or "Money in and out". Both can be downloaded to Excel.

## AI Insights (Admin only)
Keywords: ai insights, prediction, forecast, insights, recommendation, employee performance, trends, late jobs
Link: /reports
AI Insights (Reports, Admin only) forecasts sales for the next months, shows which services and customers grow, how long jobs take, which open jobs may be late, how each employee performs and gives written advice with the numbers behind it. It is calculated from the shop's own records and nothing leaves the system.

## Contacts and exporting phone numbers to Google Contacts
Keywords: contacts, google contacts, phone numbers, export contacts, vcf, vcard, csv, save numbers, phone contacts, import contacts
Link: /customers
The Admin can press "Export contacts" on the Customers page. It downloads every customer's and employee's name and phone number as a .vcf file (open it on the phone to save them) or a Google Contacts .csv file (contacts.google.com > Import). Everyone lands under the label "Sri Jayam Printers". The Contacts page in the profile menu lists the Admin and the employees with their phone numbers.

## Customers
Keywords: customer, customers, add customer, phone, whatsapp, gstin, billing person, search customer
Link: /customers
Customers lists everyone you have billed. Add or edit a customer with name, billing person, phone, WhatsApp, e-mail, address and GSTIN. A phone number can belong to one customer only.

## Quotations
Keywords: quotation, quote, estimate, approve quotation, convert
Link: /quotations
A quotation is a price offer. Create it, send the PDF, and when the customer agrees mark it OK; making the invoice from it creates the job cards.

## Users and roles
Keywords: users, roles, admin, counter, production, accounts, permissions, add user, who can, access, create login
Link: /users
Only the Admin opens Users. Roles: Admin (everything), Counter (orders, customers, invoices, job cards, assigning tasks), Production (takes and finishes tasks), Accounts (invoices, payments, purchases, cash ledger). Reports and Pricing Setup are for the Admin only. A user's phone number appears on the Contacts page.

## Company details, GST and bill numbers
Keywords: company, company details, gstin, bank details, bill number, invoice series, logo, address, shop details
Link: /company
Company Details holds the shop name, GSTIN, address, phones, e-mail, bank details printed on the bill and the next GST bill and cash bill numbers.

## Support, version and contacting PySellers
Keywords: support, help, contact, pysellers, version, about, bug, problem, complaint, developer, website
Link: /about
This software is developed by PySellers Services Pvt Ltd. For any support request write to contact@pysellers.in or call 8838587824; website www.pysellers.in. The About page shows the version. If the help chat cannot answer, use these contacts.
