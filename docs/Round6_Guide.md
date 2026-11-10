# Sri Jayam ERP - client comment of 2026-11-11 (version 1.3.1)

Client's comment (Tamil): *"Every person who works should update their own work separately. When needed, we should be able to take out only the work done by one person, on its own."*

Two parts, both built:

## 1. Each worker updates their own work

The task flow was already per person (Take it > Start > Done / Hold). New: **Add update**.

* On a task the worker holds (My Work, or *Job card > Tasks*) press **Add update** and write what is done so far, e.g. "printed 600 of 1000".
* It is saved under their name in the job's activity trail ("Progress update") and in their Work Log. Only the person doing the task - or the Admin / Counter - can write one; someone else gets 403. A task nobody has taken, or one that is still waiting, refuses.
* `POST /job-steps/{id}/update`.

## 2. One person's work, taken out on its own - the **Work Log**

Menu entry *Work Log* (Admin, Counter, production staff).

* **Admin / Counter:** choose an employee (or leave "Everyone" for one line per employee - finished, in progress, on hold, waiting, time on finished tasks, average, updates - and click a name). Choose Today / Last 7 days / This month / custom dates, filter All / Finished / Still open, and press **Excel** to download only that person's work.
* **Employees** see only their own Work Log (no employee picker; asking for a colleague gives 403).
* Each row: date, job, customer / item, task and section, what the person did (finished / started / took it), status, started and finished times, how long it took, the note they left on finishing, hold reason and every update they wrote.
* A task still open on someone's plate is always listed, whatever the dates; finished work is listed by the day it was finished.
* `GET /production/work-log?person_id=&start=&end=&state=` and `GET /production/work-log/export`.

## Notes

* "Took" the time between the task being started and finished (clock time, not working hours).
* Work done before this release counts too: it is read from the steps' existing assigned / started / finished fields. Updates only exist from now on.
* The help chat knows both topics (`backend/app/knowledge/manual.md`).
* Tests: `t_round6.py` (7 API), `ui_round6.mjs` (7 browser).
