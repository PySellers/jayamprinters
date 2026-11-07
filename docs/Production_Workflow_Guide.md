# Sri Jayam Printers ERP - Production workflow guide

How an order now travels through the shop, one team after another, and how everybody sees where it is.

## The idea in one minute

When an order is invoiced, each item becomes a **job card**. The job card gets a list of **steps** that depend on the service, for example a Bill Book:

`Design / DTP  >  Proof approval  >  Printing  >  Binding / numbering  >  Handover & delivery`

* Only the **first unfinished step is open**. The others wait.
* Each step belongs to a **work center** (Design, Front Desk, Printing, Finishing & Binding ...). The employees in that work center see the step under **My Work**.
* An employee **takes it** (or the supervisor assigns it), **starts** it, and presses **Done**. The job then moves to the next team automatically.
* When the last step (Handover & delivery) is done, the job card becomes **Delivered**.
* Every action is written to the job's **activity trail** (who, what, when, with notes), and the time each step took is recorded.

This matches how print-shop software such as Printavo, ShopVOX, EFI Pace and Odoo work orders handle it: an automatic job ticket per order, a route through departments (prepress, press, finishing, dispatch), a person on every step, start / pause / finish with timing, hand-off notifications, a shared board and a monitoring view.

## Who does what

| Person | Screen | What they do |
|---|---|---|
| Designer, printer, binder, any shop-floor employee | **My Work** | See "On me" and "Waiting for my team". Take it, Start, Done (with a note for the next person), Hold (with a reason). The menu shows a red number of tasks waiting. |
| Front desk (counter) | **My Work**, **Job Cards**, **Production** | Same as above for Front Desk steps (proof approval, handover). Also a supervisor: assign steps, add / skip / re-order / re-open steps, send work to outside companies. |
| Admin (owner) | everything + **Masters > Work Centers**, **Masters > Workflows** | Set up the teams and the steps of each service. |
| Accounts | **Production > Monitor** | Read-only view of progress and delays. |

Employees only work on steps of their own work center, or steps assigned to them. They cannot start a step before its turn.

## Screens

* **My Work** - my own list. Urgent and earliest-due jobs are first. Overdue jobs are red.
* **Production > Board** - a column per work center with every job waiting or being worked there. Filters: only overdue, only urgent / high. Click a job number to open it.
* **Production > Monitor** (admin, counter, accounts) - orders in production, overdue, due today, urgent, on hold, delivered today; work waiting and in progress per department with the average time per step; each employee's workload; steps finished in the last 7 days; overdue orders; the jobs waiting longest to be started; work out with outside companies (flagged late); jobs on hold with the reason.
* **Job Cards** - the list now shows who has each job now and how many steps are done. The **Track** button opens the job's steps.
* **Job tracking page** (`Job Cards > Track`) - every step with status, person, times and notes, plus the activity trail. Supervisors get a step menu (Assign, Edit, Move, Skip, Re-open, Delete) and **Add a step**.
* **Invoice page** - a "Production status" box shows each job card's current step, so the front desk can answer "where is my order?".
* **Masters > Work Centers** - the departments and who is in each (an employee can be in several).
* **Masters > Workflows** - the steps of each service, in order, with the work center for each. A new job copies the workflow; jobs already running keep theirs.

## Outside work (outside printing, cutting, stamp making ...)

A step of type **Sent to an outside company** shows **Send to outside company**. Fill in the company, cost, price billed to the customer and the date it is due back. This:

1. creates an **Outsource** job (visible on the Outsource screen with its margin and payments),
2. keeps the step "in progress" while the work is outside,
3. finishes the step automatically when the Outsource job is marked **Received** and hands the job to the next team,
4. puts the step **on hold** if the Outsource job is cancelled, so it can be sent to another company.

Work still out after its due date shows as **late** on the Monitor.

## Things staff may ask

* **The customer wants changes after the proof** - the supervisor opens the job, **Re-open** on the Design step. Later steps go back to waiting.
* **A step is not needed for this job** - **Skip this step** (supervisor).
* **An extra step is needed** (foil, lamination outside ...) - **Add a step** on the tracking page; it is placed before the final handover.
* **Waiting for the customer or for paper** - **Hold** with a reason. The reason shows on the board and monitor. **Resume** when ready.
* **The old status box on the Job Cards list** still works. Choosing a status moves the steps to match (for example Delivered finishes every step).
* **Choosing a designer / operator on a job card** also puts that person on the design / printing step.

## First-time set-up (admin)

1. **Masters > Work Centers**: check the six default work centers, add more if needed, and use **Team** to put each employee in the work centers they work in. (Create employee logins under **Users** first, role "production" for shop-floor staff, "counter" for the front desk.)
2. **Masters > Workflows**: check the steps of each service and change them to match the shop.
3. Each employee signs in with their own login and opens **My Work**.

## Notes

* The default work centers, workflows and every existing job card's steps are created automatically; existing jobs are placed at the step their old status says.
* Not included yet (possible next steps): SMS / WhatsApp alerts when a job reaches a team, QR codes on the paper job card to scan at each stage, pause timing with breaks, and steps that run in parallel.
