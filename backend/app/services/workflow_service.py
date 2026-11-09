"""Production workflow engine: steps of a job card, who may work on them, hand-offs and monitoring figures.

How it works
  * When a job card is created its steps are copied from the workflow template of the service (Design -> Proof
    approval -> Printing -> Binding -> Handover ...). Only the first unfinished step is "ready"; the rest wait.
  * An employee starts a step, finishes it, and the next step becomes ready for the next department.
  * A step can be put on hold (with a reason), sent to an outside company (an Outsource job is created and the step
    finishes when the work is received), skipped, or re-opened by a supervisor.
  * The job card's own status (design / approval / printing / binding / packing / delivered) follows the step that
    is being worked, and becomes "delivered" when the last step is finished.
"""
from datetime import datetime, timedelta
from typing import Dict, List, Optional

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.models.job_card import JobCard, JobCardPriority, JobCardStatus
from app.models.outsource import OutsourceJob, OutsourceStatus
from app.models.product import ProductCategory
from app.models.user import User, UserRole
from app.models.workflow import (
    OPEN_STATUSES, STEP_KINDS, JobEvent, JobStep, WorkCenter, WorkflowTemplate, WorkflowTemplateStep,
    user_work_centers,
)
from app.services.numbering import next_number
from app.services.time_utils import today_ist

STAGE_ORDER = ["pending", "design", "approval", "printing", "binding", "packing", "delivered"]
WORKING_STAGES = ("design", "approval", "printing", "binding", "packing")
PRIORITY_RANK = {"urgent": 0, "high": 1, "medium": 2, "low": 3}
MANAGER_ROLES = (UserRole.admin, UserRole.counter)  # supervisors: can assign, re-order, skip and re-open

# ---------------------------------------------------------------------------------------------------------
# Default work centers and workflows (created on first use; everything can be changed under Masters)
# ---------------------------------------------------------------------------------------------------------
DEFAULT_CENTERS = [
    ("Design", "Design / DTP - layouts, typesetting, proofs", "#1565c0"),
    ("Front Desk", "Counter: proof approval with the customer, handover and delivery", "#6a1b9a"),
    ("Printing", "Offset / digital printing", "#00695c"),
    ("Finishing & Binding", "Cutting, folding, lamination, binding, numbering", "#ef6c00"),
    ("Xerox Counter", "Xerox, printout, scanning", "#455a64"),
    ("Outside Vendor", "Work done by an outside company", "#757575"),
]

_D = ("Design / DTP", "internal", "design", "Design")
_A = ("Proof approval", "internal", "approval", "Front Desk")
_P = ("Printing", "internal", "printing", "Printing")
_F = ("Finishing", "internal", "binding", "Finishing & Binding")
_H = ("Handover & delivery", "internal", "packing", "Front Desk")

DEFAULT_STEPS = [_D, _A, _P, _F, _H]
SERVICE_STEPS = {
    "Bill Books & Stationery": [_D, _A, _P, ("Binding / numbering", "internal", "binding", "Finishing & Binding"), _H],
    "Register": [_D, _A, _P, ("Binding", "internal", "binding", "Finishing & Binding"), _H],
    "Transfer Certificate": [_D, _A, _P, _H],
    "Application Form": [_D, _A, _P, _H],
    "Menu Card": [_D, _A, _P, ("Cutting & lamination", "internal", "binding", "Finishing & Binding"), _H],
    "Book Covers": [_D, _A, _P, _F, _H],
    "Visiting Card": [_D, _A, _P, ("Cutting & lamination", "internal", "binding", "Finishing & Binding"), _H],
    "Invitation & Greeting Cards": [_D, _A, _P, _F, _H],
    "Thamboola Bag": [_D, _A, ("Outside printing", "outsource", "printing", "Outside Vendor"), _H],
    "ID Card": [_D, _P, _H],
    "Rubber Stamp": [_D, _A, ("Stamp making (outside)", "outsource", "printing", "Outside Vendor"), _H],
    "Digital Banner": [_D, _A, _P, ("Hemming & eyelets", "internal", "binding", "Finishing & Binding"), _H],
    "Binding Services": [("Binding", "internal", "binding", "Finishing & Binding"), _H],
    "Xerox / Photocopy": [("Xerox", "internal", "printing", "Xerox Counter"), ("Binding", "internal", "binding", "Finishing & Binding"), _H],
    "Printout": [("Printout", "internal", "printing", "Xerox Counter"), _H],
    "Stickers": [_D, _P, ("Cutting", "internal", "binding", "Finishing & Binding"), _H],
}


def ensure_defaults(db: Session) -> None:
    """Creates the default work centers and workflows the first time they are needed (idempotent)."""
    if db.query(WorkCenter.id).first() is None:
        for order, (name, description, color) in enumerate(DEFAULT_CENTERS):
            db.add(WorkCenter(name=name, description=description, color=color, display_order=order, is_active=True))
        db.flush()
    centers = {c.name: c.id for c in db.query(WorkCenter).all()}
    if db.query(WorkflowTemplate.id).filter(WorkflowTemplate.category_id.is_(None)).first() is None:
        _write_template(db, None, DEFAULT_STEPS, centers)
    existing = {row[0] for row in db.query(WorkflowTemplate.category_id).filter(WorkflowTemplate.category_id.isnot(None)).all()}
    for category in db.query(ProductCategory).all():
        if category.id in existing:
            continue
        spec = SERVICE_STEPS.get(category.name)
        if spec is not None:
            _write_template(db, category.id, spec, centers)
    db.flush()


def _write_template(db: Session, category_id: Optional[int], spec, centers: Dict[str, int]) -> WorkflowTemplate:
    template = WorkflowTemplate(category_id=category_id)
    db.add(template)
    db.flush()
    for position, (name, kind, stage, center) in enumerate(spec, start=1):
        db.add(WorkflowTemplateStep(
            template_id=template.id, position=position, name=name, kind=kind, stage=stage,
            work_center_id=centers.get(center),
        ))
    db.flush()
    return template


def template_steps(db: Session, category_id: Optional[int]) -> List[WorkflowTemplateStep]:
    ensure_defaults(db)
    template = None
    if category_id is not None:
        template = db.query(WorkflowTemplate).filter(WorkflowTemplate.category_id == category_id).first()
    if template is None:
        template = db.query(WorkflowTemplate).filter(WorkflowTemplate.category_id.is_(None)).first()
    return list(template.steps) if template else []


# ---------------------------------------------------------------------------------------------------------
# Events
# ---------------------------------------------------------------------------------------------------------
def log(db: Session, job: JobCard, step: Optional[JobStep], user: Optional[User], action: str, detail: Optional[str] = None) -> None:
    db.add(JobEvent(job_card_id=job.id, step_id=step.id if step is not None and step.id else None,
                    user_id=user.id if user is not None else None, action=action, detail=detail))


def _now() -> datetime:
    return datetime.utcnow()


# ---------------------------------------------------------------------------------------------------------
# Creating steps for a job card
# ---------------------------------------------------------------------------------------------------------
def create_steps_for_job(db: Session, job: JobCard, user: Optional[User] = None, log_event: bool = True) -> List[JobStep]:
    """Copies the service's workflow onto the job card. Existing jobs are put at the step their status says."""
    if job.steps:
        return list(job.steps)
    category_id = job.product.category_id if job.product is not None else None
    specs = template_steps(db, category_id)
    steps = []
    for position, spec in enumerate(specs, start=1):
        step = JobStep(job_card_id=job.id, position=position, name=spec.name, kind=spec.kind, stage=spec.stage,
                       work_center_id=spec.work_center_id, status="waiting")
        db.add(step)
        steps.append(step)
    db.flush()
    db.refresh(job)
    original = job.status
    status_now = original.value if hasattr(original, "value") else str(original or "pending")
    # an existing job's steps are dated when the job last changed, not "now", so the history and the monitor stay honest
    when = job.updated_at or job.created_at or _now()
    _apply_progress(db, job, status_now, when=when, backfill=True)
    if original != JobCardStatus.delivered:
        job.status = original or JobCardStatus.pending  # an existing job keeps the status staff last saw
    elif job.delivered_at is None:
        job.delivered_at = when
    if log_event:
        log(db, job, None, user, "created", f"{len(steps)} steps planned")
    return list(job.steps)


def _rank(stage: str) -> int:
    return STAGE_ORDER.index(stage) if stage in STAGE_ORDER else 0


def _apply_progress(db: Session, job: JobCard, status_value: str, when: Optional[datetime] = None, backfill: bool = False) -> None:
    """Puts the steps where a job-card status says the job is (used for old jobs and for manual status changes)."""
    steps = sorted(job.steps, key=lambda s: s.position)
    target = _rank(status_value)
    now = when or _now()
    seen_current = False
    for step in steps:
        if status_value == "delivered" or _rank(step.stage) < target:
            if step.status not in ("done", "skipped"):
                step.status = "done"
                step.completed_at = step.completed_at or now
                if not backfill:
                    step.started_at = step.started_at or step.completed_at
        elif _rank(step.stage) == target and not seen_current:
            seen_current = True
            if step.status in ("done", "skipped", "waiting", "ready"):
                step.status = "in_progress"
                step.started_at = step.started_at or now
                step.completed_at = None
        else:
            if step.status not in ("waiting",):
                step.status = "waiting"
                step.started_at = None
                step.completed_at = None
    normalize(db, job, when=when)


def normalize(db: Session, job: JobCard, when: Optional[datetime] = None) -> None:
    """Exactly the first unfinished step is open; later ones wait. Then the job's own status follows."""
    steps = sorted(job.steps, key=lambda s: s.position)
    if not steps:
        return
    now = when or _now()
    first_open_found = False
    for step in steps:
        if step.status in ("done", "skipped"):
            continue
        if not first_open_found:
            first_open_found = True
            if step.status == "waiting":
                step.status = "ready"
                step.ready_at = now
        elif step.status == "ready":
            step.status = "waiting"
    unfinished = [s for s in steps if s.status not in ("done", "skipped")]
    if not unfinished:
        if job.status != JobCardStatus.delivered:
            job.status = JobCardStatus.delivered
            job.delivered_at = now
    else:
        job.delivered_at = None
        current = unfinished[0]
        stage = current.stage if current.stage in WORKING_STAGES else "printing"
        # a job that has not been touched yet stays "pending" until its first step is started
        if current.status == "ready" and current is steps[0] and current.started_at is None and job.status in (JobCardStatus.pending,):
            return
        job.status = JobCardStatus(stage)


# ---------------------------------------------------------------------------------------------------------
# Who can do what
# ---------------------------------------------------------------------------------------------------------
def center_ids_of(db: Session, user: User) -> set:
    rows = db.query(user_work_centers.c.work_center_id).filter(user_work_centers.c.user_id == user.id).all()
    return {r[0] for r in rows}


def is_manager(user: User) -> bool:
    return user.role in MANAGER_ROLES


def can_act(db: Session, user: User, step: JobStep, centers: Optional[set] = None) -> bool:
    """Admin / counter supervise everything; others work their own steps or open steps of their work centers."""
    if is_manager(user):
        return True
    if step.assigned_to is not None:
        return step.assigned_to == user.id
    centers = centers if centers is not None else center_ids_of(db, user)
    if not centers and user.role != UserRole.accounts:
        return True  # an employee who is not in any work center can take any step nobody has taken yet
    return step.work_center_id is not None and step.work_center_id in centers


def _require_manager(user: User) -> None:
    if not is_manager(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the admin or the counter (supervisor) can do this.")


def _require_act(db: Session, user: User, step: JobStep) -> None:
    if not can_act(db, user, step):
        who = step.assignee.name if step.assignee is not None else (step.work_center.name if step.work_center is not None else "another team")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"This step belongs to {who}.")


def _job_of(step: JobStep) -> JobCard:
    return step.job_card


def _conflict(message: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=message)


# ---------------------------------------------------------------------------------------------------------
# Step actions
# ---------------------------------------------------------------------------------------------------------
def start_step(db: Session, step: JobStep, user: User) -> JobStep:
    _require_act(db, user, step)
    if step.status == "in_progress":
        return step
    if step.status not in ("ready", "on_hold"):
        raise _conflict(f"'{step.name}' is not ready to start yet" if step.status == "waiting" else f"'{step.name}' is already {step.status.replace('_', ' ')}")
    job = _job_of(step)
    resumed = step.status == "on_hold"
    step.status = "in_progress"
    step.hold_reason = None
    if step.started_at is None:
        step.started_at = _now()
        step.started_by = user.id
    if step.assigned_to is None:
        step.assigned_to = user.id
    normalize(db, job)
    log(db, job, step, user, "resumed" if resumed else "started", step.name)
    return step


def complete_step(db: Session, step: JobStep, user: User, note: Optional[str] = None) -> JobStep:
    _require_act(db, user, step)
    if step.status in ("done", "skipped"):
        raise _conflict(f"'{step.name}' is already finished")
    if step.status == "waiting":
        raise _conflict(f"'{step.name}' is not ready yet - the step before it is still open")
    if step.status == "on_hold":
        raise _conflict(f"'{step.name}' is on hold - resume it before finishing it")
    job = _job_of(step)
    now = _now()
    if step.started_at is None:
        step.started_at = now
        step.started_by = user.id
    if step.assigned_to is None:
        step.assigned_to = user.id
    step.status = "done"
    step.completed_at = now
    step.completed_by = user.id
    step.hold_reason = None
    if note and note.strip():
        step.notes = note.strip()
    if step.kind == "outsource" and step.outsource_job is not None and step.outsource_job.status in (OutsourceStatus.sent, OutsourceStatus.in_progress):
        step.outsource_job.status = OutsourceStatus.received
        step.outsource_job.received_date = today_ist()
    before = job.status
    normalize(db, job)
    log(db, job, step, user, "completed", (note or "").strip() or step.name)
    if job.status == JobCardStatus.delivered and before != JobCardStatus.delivered:
        log(db, job, None, user, "delivered", "All steps finished - order delivered")
    else:
        nxt = next((s for s in sorted(job.steps, key=lambda s: s.position) if s.status == "ready"), None)
        if nxt is not None:
            who = nxt.assignee.name if nxt.assignee is not None else (nxt.work_center.name if nxt.work_center is not None else "next team")
            log(db, job, nxt, user, "handoff", f"Passed to {nxt.name} ({who})")
    return step


def hold_step(db: Session, step: JobStep, user: User, reason: str) -> JobStep:
    _require_act(db, user, step)
    if not reason or not reason.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Say why the step is on hold")
    if step.status not in ("ready", "in_progress"):
        raise _conflict(f"'{step.name}' cannot be put on hold now ({step.status.replace('_', ' ')})")
    step.status = "on_hold"
    step.hold_reason = reason.strip()
    log(db, _job_of(step), step, user, "on_hold", reason.strip())
    return step


def reopen_step(db: Session, step: JobStep, user: User, reason: Optional[str] = None) -> JobStep:
    _require_manager(user)
    if step.status not in ("done", "skipped"):
        raise _conflict(f"'{step.name}' is not finished, so it cannot be re-opened")
    job = _job_of(step)
    step.status = "in_progress" if step.status == "done" else "ready"
    step.completed_at = None
    step.completed_by = None
    for later in job.steps:
        if later.position > step.position and later.status in ("ready", "in_progress", "on_hold"):
            later.status = "waiting"
            later.hold_reason = None
    normalize(db, job)
    log(db, job, step, user, "reopened", (reason or "").strip() or step.name)
    return step


def skip_step(db: Session, step: JobStep, user: User, reason: Optional[str] = None) -> JobStep:
    _require_manager(user)
    if step.status in ("done", "skipped"):
        raise _conflict(f"'{step.name}' is already finished")
    job = _job_of(step)
    step.status = "skipped"
    step.completed_at = _now()
    step.completed_by = user.id
    normalize(db, job)
    log(db, job, step, user, "skipped", (reason or "").strip() or step.name)
    return step


def assign_step(db: Session, step: JobStep, user: User, assignee_id: Optional[int]) -> JobStep:
    """Supervisors assign anyone; any employee can take an open step of their own work center for themselves."""
    job = _job_of(step)
    if step.status in ("done", "skipped"):
        raise _conflict(f"'{step.name}' is already finished")
    if assignee_id is None:
        _require_manager(user)
        step.assigned_to = None
        log(db, job, step, user, "unassigned", step.name)
        return step
    target = db.query(User).filter(User.id == assignee_id, User.is_active.is_(True)).first()
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    if not is_manager(user):
        if target.id != user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only take a step for yourself.")
        if step.assigned_to not in (None, user.id) or not can_act(db, user, step):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This step belongs to someone else.")
    step.assigned_to = target.id
    log(db, job, step, user, "assigned", f"{step.name} -> {target.name}")
    return step


def update_step(db: Session, step: JobStep, user: User, changes: dict) -> JobStep:
    _require_manager(user)
    job = _job_of(step)
    if "name" in changes and changes["name"] is not None:
        if not changes["name"].strip():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A step needs a name")
        step.name = changes["name"].strip()
    if "work_center_id" in changes:
        if changes["work_center_id"] is not None and not db.query(WorkCenter.id).filter(WorkCenter.id == changes["work_center_id"]).first():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Work center not found")
        step.work_center_id = changes["work_center_id"]
    for key in ("due_date", "notes"):
        if key in changes:
            setattr(step, key, changes[key])
    if changes.get("kind"):
        if changes["kind"] not in STEP_KINDS:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown step type")
        step.kind = changes["kind"]
    log(db, job, step, user, "edited", step.name)
    return step


def move_step(db: Session, step: JobStep, user: User, direction: str) -> None:
    _require_manager(user)
    job = _job_of(step)
    ordered = sorted(job.steps, key=lambda s: s.position)
    index = ordered.index(step)
    swap = index - 1 if direction == "up" else index + 1
    if swap < 0 or swap >= len(ordered):
        return
    other = ordered[swap]
    if step.status in ("done", "skipped") or other.status in ("done", "skipped"):
        raise _conflict("Finished steps cannot be moved")
    step.position, other.position = other.position, step.position
    db.flush()
    db.refresh(job)
    normalize(db, job)
    log(db, job, step, user, "moved", f"{step.name} moved {direction}")


def _may_add_task(job: JobCard, user: User) -> bool:
    """Supervisors, and any employee who is holding an open step of this very job, may add a task to it."""
    if is_manager(user):
        return True
    return any(s.assigned_to == user.id and s.status in OPEN_STATUSES for s in job.steps)


def add_step(db: Session, job: JobCard, user: User, name: str, work_center_id: Optional[int], kind: str = "internal",
             stage: Optional[str] = None, after_step_id: Optional[int] = None, assigned_to: Optional[int] = None) -> JobStep:
    if not _may_add_task(job, user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the admin, the counter or the person working on this job can add a task.")
    if job.status == JobCardStatus.delivered:
        raise _conflict("This order is already delivered")
    if not name or not name.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A step needs a name")
    if kind not in STEP_KINDS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown step type")
    if stage is not None and stage not in WORKING_STAGES:
        stage = None
    if work_center_id is not None and not db.query(WorkCenter.id).filter(WorkCenter.id == work_center_id).first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Work center not found")
    assignee = None
    if assigned_to is not None:
        _require_manager(user)
        assignee = db.query(User).filter(User.id == assigned_to, User.is_active.is_(True)).first()
        if assignee is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    ordered = sorted(job.steps, key=lambda s: s.position)
    final_handover = bool(ordered) and ordered[-1].stage == "packing" and ordered[-1].status not in ("done", "skipped")
    anchor = None
    if after_step_id is not None:
        anchor = next((s for s in ordered if s.id == after_step_id), None)
        if anchor is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="The step to add after was not found")
    elif ordered:
        anchor = ordered[-2] if final_handover and len(ordered) > 1 else ordered[-1]
    insert_at = (anchor.position + 1) if anchor is not None else 1
    if final_handover and anchor is ordered[-1]:
        # nothing may come after the final hand-over: the task goes in front of it
        insert_at = ordered[-1].position
        anchor = ordered[-2] if len(ordered) > 1 else None
    if insert_at <= len(ordered) and any(s.status in ("done", "skipped") for s in ordered if s.position >= insert_at):
        raise _conflict("A task cannot be added in front of a step that is already finished")
    if stage is None:  # the job's status follows the stage of the step being worked, so a new task takes its neighbour's stage
        stage = anchor.stage if anchor is not None and anchor.stage in WORKING_STAGES else "printing"
    for existing in ordered:
        if existing.position >= insert_at:
            existing.position += 1
    step = JobStep(job_card_id=job.id, position=insert_at, name=name.strip(), kind=kind, stage=stage,
                   work_center_id=work_center_id, status="waiting", assigned_to=assignee.id if assignee is not None else None)
    db.add(step)
    db.flush()
    db.refresh(job)
    normalize(db, job)
    log(db, job, step, user, "step_added", step.name + (f" -> {assignee.name}" if assignee is not None else ""))
    return step


def delete_step(db: Session, step: JobStep, user: User) -> None:
    _require_manager(user)
    if step.status in ("in_progress", "on_hold", "done"):
        raise _conflict("A step that has been started cannot be deleted - skip it instead")
    job = _job_of(step)
    name = step.name
    log(db, job, None, user, "step_removed", name)
    db.delete(step)
    db.flush()
    db.refresh(job)
    for position, remaining in enumerate(sorted(job.steps, key=lambda s: s.position), start=1):
        remaining.position = position
    normalize(db, job)


def send_out(db: Session, step: JobStep, user: User, vendor_id: Optional[int], vendor_name: Optional[str], cost_amount: float,
             customer_price: float, expected_date, description: Optional[str]) -> OutsourceJob:
    """Sends the work of an outside-vendor step to an outside company: creates an Outsource job linked to this step."""
    _require_act(db, user, step)
    job = _job_of(step)
    if step.kind != "outsource":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This step is not an outside-company step")
    if step.status not in ("ready", "on_hold", "in_progress"):
        raise _conflict(f"'{step.name}' is not ready to be sent out yet")
    if step.outsource_job_id and step.outsource_job is not None and step.outsource_job.status != OutsourceStatus.cancelled:
        raise _conflict("This step has already been sent out")
    if not vendor_id and not (vendor_name or "").strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Say which company the work goes to")
    item = job.quotation_item
    outsource = OutsourceJob(
        job_number=next_number(db, OutsourceJob.job_number, "OS"),
        vendor_id=vendor_id, vendor_name=(vendor_name or "").strip() or None, customer_id=job.customer_id, job_card_id=job.id,
        service=f"{step.name} - {job.product.name if job.product is not None else job.job_number}",
        description=(description or (item.spec_notes if item is not None else None)),
        quantity=int(item.quantity) if item is not None and item.quantity else 1,
        sent_date=today_ist(), expected_date=expected_date, status=OutsourceStatus.sent,
        cost_amount=cost_amount or 0.0, customer_price=customer_price or 0.0,
    )
    db.add(outsource)
    db.flush()
    step.outsource_job_id = outsource.id
    step.status = "in_progress"
    step.hold_reason = None
    if step.started_at is None:
        step.started_at = _now()
        step.started_by = user.id
    if step.assigned_to is None:
        step.assigned_to = user.id
    normalize(db, job)
    log(db, job, step, user, "sent_out", f"{outsource.job_number} to {outsource.vendor_name or 'vendor #' + str(vendor_id)}"
        + (f", back by {expected_date.isoformat()}" if expected_date else ""))
    return outsource


def on_outsource_changed(db: Session, outsource: OutsourceJob, user: Optional[User]) -> None:
    """Keeps a linked step in step with its Outsource job (received -> step done, cancelled -> step on hold)."""
    step = db.query(JobStep).filter(JobStep.outsource_job_id == outsource.id).first()
    if step is None or step.status in ("done", "skipped"):
        return
    job = _job_of(step)
    if outsource.status in (OutsourceStatus.received, OutsourceStatus.delivered):
        now = _now()
        step.status = "done"
        step.completed_at = now
        step.started_at = step.started_at or now
        step.completed_by = user.id if user is not None else None
        normalize(db, job)
        log(db, job, step, user, "completed", f"Received from {outsource.vendor_name or 'vendor'} ({outsource.job_number})")
        nxt = next((s for s in sorted(job.steps, key=lambda s: s.position) if s.status == "ready"), None)
        if nxt is not None:
            log(db, job, nxt, user, "handoff", f"Passed to {nxt.name}")
        elif job.status == JobCardStatus.delivered:
            log(db, job, None, user, "delivered", "All steps finished - order delivered")
    elif outsource.status == OutsourceStatus.cancelled:
        step.status = "on_hold"
        step.hold_reason = f"Outside job {outsource.job_number} was cancelled"
        log(db, job, step, user, "on_hold", step.hold_reason)


def override_status(db: Session, job: JobCard, new_status: str, user: Optional[User]) -> None:
    """A supervisor's quick status change on the job list: the steps are moved to match."""
    create_steps_for_job(db, job, user, log_event=False)
    for step in job.steps:  # a manual change starts from a clean slate for the steps that are re-worked
        if _rank(step.stage) >= _rank(new_status) and new_status != "delivered":
            step.status = "waiting"
            step.completed_at = None
            step.completed_by = None
    _apply_progress(db, job, new_status)
    if new_status != "delivered":
        job.status = JobCardStatus(new_status)
    log(db, job, None, user, "status_set", f"Status set to {new_status} on the job list")


# ---------------------------------------------------------------------------------------------------------
# Read models
# ---------------------------------------------------------------------------------------------------------
def minutes_between(start: Optional[datetime], end: Optional[datetime]) -> Optional[int]:
    if start is None:
        return None
    return max(int(((end or _now()) - start).total_seconds() // 60), 0)


def _is_overdue(job: JobCard) -> bool:
    return bool(job.delivery_date and job.delivery_date < today_ist() and job.status != JobCardStatus.delivered)


def step_view(db: Session, step: JobStep, user: Optional[User] = None, centers: Optional[set] = None) -> dict:
    return {
        "id": step.id,
        "job_card_id": step.job_card_id,
        "position": step.position,
        "name": step.name,
        "kind": step.kind,
        "stage": step.stage,
        "status": step.status,
        "work_center_id": step.work_center_id,
        "work_center_name": step.work_center.name if step.work_center is not None else None,
        "work_center_color": step.work_center.color if step.work_center is not None else None,
        "assigned_to": step.assigned_to,
        "assigned_to_name": step.assignee.name if step.assignee is not None else None,
        "ready_at": step.ready_at,
        "started_at": step.started_at,
        "completed_at": step.completed_at,
        "started_by_name": step.starter.name if step.starter is not None else None,
        "completed_by_name": step.completer.name if step.completer is not None else None,
        "minutes_taken": minutes_between(step.started_at, step.completed_at) if step.started_at else None,
        "minutes_waiting": minutes_between(step.ready_at, step.started_at) if step.ready_at and step.status in ("ready",) else None,
        "due_date": step.due_date,
        "hold_reason": step.hold_reason,
        "notes": step.notes,
        "outsource_job_id": step.outsource_job_id,
        "outsource_job_number": step.outsource_job.job_number if step.outsource_job is not None else None,
        "outsource_vendor": (step.outsource_job.vendor_name or (step.outsource_job.vendor.name if step.outsource_job.vendor is not None else None)) if step.outsource_job is not None else None,
        "outsource_expected_date": step.outsource_job.expected_date if step.outsource_job is not None else None,
        "can_act": can_act(db, user, step, centers) if user is not None else False,
    }


def job_summary(job: JobCard) -> dict:
    steps = sorted(job.steps, key=lambda s: s.position)
    total = len([s for s in steps if s.status != "skipped"])
    done = len([s for s in steps if s.status == "done"])
    current = next((s for s in steps if s.status in OPEN_STATUSES), None)
    return {
        "steps_total": total,
        "steps_done": done,
        "current_step": current.name if current is not None else None,
        "current_step_status": current.status if current is not None else None,
        "current_work_center": current.work_center.name if current is not None and current.work_center is not None else None,
        "current_assignee": current.assignee.name if current is not None and current.assignee is not None else None,
        "overdue": _is_overdue(job),
    }


def _card(db: Session, step: JobStep, user: Optional[User], centers: Optional[set]) -> dict:
    job = step.job_card
    view = step_view(db, step, user, centers)
    summary = job_summary(job)
    view.update({
        "job_number": job.job_number,
        "customer_name": job.customer.name if job.customer is not None else None,
        "product_name": job.product.name if job.product is not None else None,
        "quantity": job.quotation_item.quantity if job.quotation_item is not None else None,
        "priority": job.priority.value if hasattr(job.priority, "value") else str(job.priority),
        "delivery_date": job.delivery_date,
        "overdue": summary["overdue"],
        "steps_total": summary["steps_total"],
        "steps_done": summary["steps_done"],
        "job_notes": job.notes,
    })
    return view


def _sort_key(card: dict):
    return (PRIORITY_RANK.get(card["priority"], 2), card["delivery_date"] is None, card["delivery_date"] or today_ist(), card["job_card_id"])


def _open_steps_query(db: Session):
    return (
        db.query(JobStep)
        .join(JobCard, JobCard.id == JobStep.job_card_id)
        .options(joinedload(JobStep.job_card).joinedload(JobCard.steps), joinedload(JobStep.work_center), joinedload(JobStep.assignee))
        .filter(JobStep.status.in_(OPEN_STATUSES), JobCard.status != JobCardStatus.delivered)
    )


def my_work(db: Session, user: User) -> dict:
    centers = center_ids_of(db, user)
    mine, queue = [], []
    for step in _open_steps_query(db).all():
        if step.assigned_to == user.id:
            mine.append(_card(db, step, user, centers))
        elif step.assigned_to is None and step.work_center_id in centers:
            queue.append(_card(db, step, user, centers))
    mine.sort(key=_sort_key)
    queue.sort(key=_sort_key)
    names = [c.name for c in db.query(WorkCenter).filter(WorkCenter.id.in_(centers)).order_by(WorkCenter.display_order).all()] if centers else []
    return {"mine": mine, "queue": queue, "work_centers": names, "count": len(mine) + len(queue)}


def board(db: Session, user: Optional[User], only_overdue: bool = False, only_urgent: bool = False, work_center_id: Optional[int] = None) -> dict:
    centers = center_ids_of(db, user) if user is not None else set()
    columns = {}
    for center in db.query(WorkCenter).filter(WorkCenter.is_active.is_(True)).order_by(WorkCenter.display_order, WorkCenter.id).all():
        columns[center.id] = {"id": center.id, "name": center.name, "color": center.color, "cards": []}
    unassigned = {"id": None, "name": "No work center", "color": "#9e9e9e", "cards": []}
    for step in _open_steps_query(db).all():
        card = _card(db, step, user, centers)
        if only_overdue and not card["overdue"]:
            continue
        if only_urgent and card["priority"] not in ("urgent", "high"):
            continue
        if work_center_id is not None and step.work_center_id != work_center_id:
            continue
        column = columns.get(step.work_center_id, unassigned)
        column["cards"].append(card)
    result = list(columns.values())
    if unassigned["cards"]:
        result.append(unassigned)
    for column in result:
        column["cards"].sort(key=_sort_key)
    return {"columns": result}


def summary(db: Session) -> dict:
    today = today_ist()
    now = _now()
    jobs_open = db.query(JobCard).filter(JobCard.status != JobCardStatus.delivered).all()
    open_ids = {j.id for j in jobs_open}
    overdue = [j for j in jobs_open if j.delivery_date and j.delivery_date < today]
    due_today = [j for j in jobs_open if j.delivery_date == today]
    urgent = [j for j in jobs_open if j.priority in (JobCardPriority.urgent, JobCardPriority.high)]
    day_start = datetime.combine(today, datetime.min.time()) - timedelta(hours=5, minutes=30)  # IST midnight in UTC
    week_start = day_start - timedelta(days=6)
    delivered_today = db.query(func.count(JobCard.id)).filter(JobCard.delivered_at >= day_start).scalar() or 0

    steps = (
        db.query(JobStep)
        .options(joinedload(JobStep.job_card), joinedload(JobStep.work_center), joinedload(JobStep.assignee), joinedload(JobStep.completer))
        .all()
    )
    open_steps = [s for s in steps if s.status in OPEN_STATUSES and s.job_card_id in open_ids]
    by_center: Dict[str, dict] = {}
    for center in db.query(WorkCenter).filter(WorkCenter.is_active.is_(True)).order_by(WorkCenter.display_order, WorkCenter.id).all():
        by_center[center.name] = {"id": center.id, "name": center.name, "color": center.color, "ready": 0, "in_progress": 0, "on_hold": 0,
                                  "done_today": 0, "avg_minutes": None, "_mins": []}
    for s in steps:
        name = s.work_center.name if s.work_center is not None else None
        if name not in by_center:
            continue
        row = by_center[name]
        if s.status in OPEN_STATUSES and s.job_card_id in open_ids:
            row[s.status] += 1
        if s.status == "done" and s.completed_at and s.completed_at >= day_start:
            row["done_today"] += 1
        if s.status == "done" and s.completed_at and s.completed_at >= week_start and s.started_at:
            row["_mins"].append(minutes_between(s.started_at, s.completed_at) or 0)
    for row in by_center.values():
        mins = row.pop("_mins")
        row["avg_minutes"] = round(sum(mins) / len(mins)) if mins else None

    employees: Dict[int, dict] = {}
    for s in steps:
        for uid, name in ((s.assigned_to, s.assignee.name if s.assignee is not None else None), (s.completed_by, s.completer.name if s.completer is not None else None)):
            if uid is not None and uid not in employees:
                employees[uid] = {"user_id": uid, "name": name, "in_progress": 0, "assigned_waiting": 0, "on_hold": 0, "done_today": 0, "done_week": 0}
    for s in steps:
        if s.assigned_to is not None and s.status in OPEN_STATUSES and s.job_card_id in open_ids:
            key = {"in_progress": "in_progress", "ready": "assigned_waiting", "on_hold": "on_hold"}[s.status]
            employees[s.assigned_to][key] += 1
        if s.status == "done" and s.completed_by is not None and s.completed_at:
            if s.completed_at >= day_start:
                employees[s.completed_by]["done_today"] += 1
            if s.completed_at >= week_start:
                employees[s.completed_by]["done_week"] += 1

    longest = []
    for s in open_steps:
        if s.status == "ready" and s.ready_at:
            longest.append({
                "job_card_id": s.job_card_id, "job_number": s.job_card.job_number, "step_name": s.name,
                "work_center_name": s.work_center.name if s.work_center is not None else None,
                "waiting_minutes": minutes_between(s.ready_at, now),
            })
    longest.sort(key=lambda r: -(r["waiting_minutes"] or 0))

    outside = []
    for o in db.query(OutsourceJob).filter(OutsourceJob.status.in_([OutsourceStatus.sent, OutsourceStatus.in_progress])).order_by(OutsourceJob.expected_date).all():
        outside.append({
            "id": o.id, "job_number": o.job_number, "vendor": o.vendor_name or (o.vendor.name if o.vendor is not None else None),
            "service": o.service, "sent_date": o.sent_date, "expected_date": o.expected_date,
            "late": bool(o.expected_date and o.expected_date < today), "job_card_id": o.job_card_id,
        })

    on_hold = [{
        "job_card_id": s.job_card_id, "job_number": s.job_card.job_number, "step_name": s.name, "reason": s.hold_reason,
        "work_center_name": s.work_center.name if s.work_center is not None else None,
    } for s in open_steps if s.status == "on_hold"]

    trend = []
    for back in range(6, -1, -1):
        start = day_start - timedelta(days=back)
        end = start + timedelta(days=1)
        trend.append({
            "date": (today - timedelta(days=back)).isoformat(),
            "steps_done": len([s for s in steps if s.status == "done" and s.completed_at and start <= s.completed_at < end]),
            "orders_delivered": db.query(func.count(JobCard.id)).filter(JobCard.delivered_at >= start, JobCard.delivered_at < end).scalar() or 0,
        })

    overdue_list = sorted(overdue, key=lambda j: j.delivery_date)[:15]
    return {
        "open_jobs": len(jobs_open),
        "overdue_jobs": len(overdue),
        "due_today": len(due_today),
        "urgent_jobs": len(urgent),
        "delivered_today": delivered_today,
        "on_hold_steps": len(on_hold),
        "by_work_center": list(by_center.values()),
        "by_employee": sorted(employees.values(), key=lambda e: (-e["in_progress"], -e["done_week"], e["name"] or "")),
        "waiting_longest": longest[:10],
        "outside_work": outside,
        "on_hold": on_hold,
        "overdue": [{
            "job_card_id": j.id, "job_number": j.job_number, "customer_name": j.customer.name if j.customer is not None else None,
            "product_name": j.product.name if j.product is not None else None, "delivery_date": j.delivery_date,
            **{k: v for k, v in job_summary(j).items() if k in ("current_step", "current_work_center", "current_assignee")},
        } for j in overdue_list],
        "trend": trend,
    }


def timeline(db: Session, job: JobCard) -> List[dict]:
    rows = (
        db.query(JobEvent).options(joinedload(JobEvent.user), joinedload(JobEvent.step))
        .filter(JobEvent.job_card_id == job.id).order_by(JobEvent.id.asc()).all()
    )
    return [{
        "id": e.id, "step_id": e.step_id, "step_name": e.step.name if e.step is not None else None,
        "user_name": e.user.name if e.user is not None else None, "action": e.action, "detail": e.detail, "created_at": e.created_at,
    } for e in rows]
