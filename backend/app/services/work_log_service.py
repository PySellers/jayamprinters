"""The work of one employee, taken out on its own: every task they took, started, finished or put on hold in a period, with the
times, how long it took, the notes and the progress updates they wrote - and the same for the whole team in one summary.

Managers (Admin, Counter) can pull out anyone; everybody else sees only their own work."""
from collections import defaultdict
from datetime import date, datetime
from io import BytesIO
from typing import Any, Dict, List, Optional

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.models.job_card import JobCard
from app.models.user import User
from app.models.workflow import JobEvent, JobStep
from app.services.time_utils import utc_naive_to_ist

OPEN = ("ready", "in_progress", "on_hold")
STATE_LABEL = {"waiting": "Waiting", "ready": "Ready", "in_progress": "In progress", "on_hold": "On hold", "done": "Done", "skipped": "Skipped"}


def _ist(value: Optional[datetime]) -> Optional[datetime]:
    return utc_naive_to_ist(value) if value else None


def _text(value: Optional[datetime]) -> str:
    v = _ist(value)
    return v.strftime("%d-%m-%Y %H:%M") if v else ""


def _minutes(a: Optional[datetime], b: Optional[datetime]) -> Optional[int]:
    return max(int((b - a).total_seconds() // 60), 0) if a and b else None


def _when(step: JobStep) -> Optional[datetime]:
    """The moment this task counts for: when it was finished, else started, else when it became ready."""
    return step.completed_at or step.started_at or step.ready_at


def _took_part(step: JobStep, person_id: int) -> str:
    """What the person did on the task: 'finished' / 'started' / 'taken' (assigned)."""
    if step.completed_by == person_id:
        return "finished"
    if step.started_by == person_id:
        return "started"
    return "taken"


def person_rows(db: Session, person_id: int, start: date, end: date, state: str = "all") -> List[Dict[str, Any]]:
    steps = (
        db.query(JobStep)
        .options(joinedload(JobStep.job_card).joinedload(JobCard.customer), joinedload(JobStep.job_card).joinedload(JobCard.product), joinedload(JobStep.work_center))
        .filter(or_(JobStep.assigned_to == person_id, JobStep.started_by == person_id, JobStep.completed_by == person_id))
        .all()
    )
    ids = [s.id for s in steps]
    updates: Dict[int, List[Dict[str, str]]] = defaultdict(list)
    if ids:
        for e in db.query(JobEvent).filter(JobEvent.step_id.in_(ids), JobEvent.user_id == person_id, JobEvent.action == "update").order_by(JobEvent.id).all():
            updates[e.step_id].append({"at": _text(e.created_at), "text": e.detail or ""})
    rows: List[Dict[str, Any]] = []
    for s in steps:
        when = _when(s)
        day = _ist(when).date() if when else None
        still_open = s.status in OPEN
        # work still on their plate is always shown; finished work only when it falls in the period
        if not still_open and (day is None or day < start or day > end):
            continue
        if state == "done" and s.status != "done":
            continue
        if state == "open" and not still_open:
            continue
        job = s.job_card
        rows.append({
            "step_id": s.id, "job_card_id": s.job_card_id, "job_number": job.job_number,
            "customer": (job.customer.billing_person_name or job.customer.name) if job.customer is not None else "",
            "item": job.product.name if job.product is not None else "",
            "step": s.name, "section": s.work_center.name if s.work_center is not None else "",
            "status": s.status, "status_label": STATE_LABEL.get(s.status, s.status), "part": _took_part(s, person_id),
            "date": day.isoformat() if day else None,
            "started": _text(s.started_at), "finished": _text(s.completed_at),
            "minutes": _minutes(s.started_at, s.completed_at), "note": s.notes or "", "hold_reason": s.hold_reason or "",
            "updates": updates.get(s.id, []),
            "_sort": when or datetime.min,
        })
    rows.sort(key=lambda r: r["_sort"], reverse=True)
    for r in rows:
        del r["_sort"]
    return rows


def _summary(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    done = [r for r in rows if r["status"] == "done" and r["part"] == "finished"]
    timed = [r["minutes"] for r in done if r["minutes"] is not None]
    by_day: Dict[str, int] = defaultdict(int)
    by_section: Dict[str, int] = defaultdict(int)
    for r in done:
        if r["date"]:
            by_day[r["date"]] += 1
        by_section[r["section"] or "-"] += 1
    return {
        "finished": len(done),
        "in_progress": len([r for r in rows if r["status"] == "in_progress"]),
        "on_hold": len([r for r in rows if r["status"] == "on_hold"]),
        "waiting_to_start": len([r for r in rows if r["status"] == "ready"]),
        "total_minutes": sum(timed),
        "average_minutes": round(sum(timed) / len(timed)) if timed else None,
        "updates": sum(len(r["updates"]) for r in rows),
        "jobs": len({r["job_card_id"] for r in rows}),
        "by_day": [{"date": d, "finished": n} for d, n in sorted(by_day.items())],
        "by_section": [{"section": k, "finished": n} for k, n in sorted(by_section.items(), key=lambda kv: -kv[1])],
    }


def work_log(db: Session, person_id: int, start: date, end: date, state: str = "all") -> Dict[str, Any]:
    person = db.query(User).filter(User.id == person_id).first()
    rows = person_rows(db, person_id, start, end, state)
    return {
        "person": {"id": person.id, "name": person.name, "role": person.role.value, "phone": person.phone} if person is not None else None,
        "start": start.isoformat(), "end": end.isoformat(), "state": state,
        "summary": _summary(rows), "rows": rows,
    }


def team_summary(db: Session, start: date, end: date) -> List[Dict[str, Any]]:
    """One line per employee: what each did in the period (click one to pull out their full work)."""
    out = []
    for u in db.query(User).filter(User.is_active.is_(True)).order_by(User.name).all():
        s = _summary(person_rows(db, u.id, start, end))
        if s["finished"] or s["in_progress"] or s["on_hold"] or s["waiting_to_start"]:
            out.append({"id": u.id, "name": u.name, "role": u.role.value, **{k: s[k] for k in ("finished", "in_progress", "on_hold", "waiting_to_start", "total_minutes", "average_minutes", "updates", "jobs")}})
    out.sort(key=lambda r: (-r["finished"], r["name"]))
    return out


def work_log_excel(data: Dict[str, Any]) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "Work log"
    person = data["person"] or {"name": "-", "role": ""}
    ws.append([f"Work done by {person['name']}", f"{data['start']} to {data['end']}"])
    ws["A1"].font = Font(bold=True, size=14)
    s = data["summary"]
    ws.append([f"Finished {s['finished']}", f"In progress {s['in_progress']}", f"On hold {s['on_hold']}", f"Time on finished tasks {s['total_minutes']} min", f"Jobs {s['jobs']}"])
    ws.append([])
    ws.append(["Date", "Job", "Customer", "Item", "Task", "Section", "What they did", "Status", "Started", "Finished", "Minutes", "Note", "Updates"])
    for cell in ws[4]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="1A237E")
        cell.alignment = Alignment(horizontal="center", wrap_text=True)
    for r in data["rows"]:
        ws.append([r["date"] or "", r["job_number"], r["customer"], r["item"], r["step"], r["section"], r["part"], r["status_label"],
                   r["started"], r["finished"], r["minutes"] if r["minutes"] is not None else "", r["note"] or r["hold_reason"],
                   " | ".join(f"{u['at']}: {u['text']}" for u in r["updates"])])
    for col, width in zip("ABCDEFGHIJKLM", (12, 12, 24, 26, 22, 18, 12, 13, 17, 17, 9, 40, 50)):
        ws.column_dimensions[col].width = width
    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()
