"""Production workflow API: work centers, step templates, the steps of a job card, my work, the board and monitoring."""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user, require_role
from app.models.job_card import JobCard
from app.models.product import ProductCategory
from app.models.user import User, UserRole
from app.models.workflow import (
    OPEN_STATUSES, STEP_KINDS, JobStep, WorkCenter, WorkflowTemplate, WorkflowTemplateStep, user_work_centers,
)
from app.schemas.workflow import (
    AssignIn, EventOut, HoldIn, MembersIn, MoveIn, NoteIn, SendOutIn, StaffOut, StepAdd, StepOut, StepUpdate,
    TemplateIn, TemplateOut, TemplateStepOut, WorkCenterIn, WorkCenterOut, WorkCenterUpdate,
)
from app.services import workflow_service as wf

admin_only = [Depends(require_role(UserRole.admin))]

work_center_router = APIRouter(prefix="/work-centers", tags=["workflow"])
template_router = APIRouter(prefix="/workflow-templates", tags=["workflow"])
steps_router = APIRouter(tags=["workflow"])
production_router = APIRouter(prefix="/production", tags=["workflow"])


def _center(db: Session, center_id: int) -> WorkCenter:
    row = db.query(WorkCenter).filter(WorkCenter.id == center_id).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Work center not found")
    return row


def _center_out(db: Session, center: WorkCenter) -> WorkCenterOut:
    open_steps = db.query(func.count(JobStep.id)).filter(JobStep.work_center_id == center.id, JobStep.status.in_(OPEN_STATUSES)).scalar() or 0
    return WorkCenterOut(
        id=center.id, name=center.name, description=center.description, color=center.color,
        display_order=center.display_order, is_active=center.is_active,
        members=[{"id": u.id, "name": u.name} for u in sorted(center.members, key=lambda u: u.name or "")], open_steps=open_steps,
    )


# ---- work centers ---------------------------------------------------------------------------------------
@work_center_router.get("/", response_model=List[WorkCenterOut])
def list_work_centers(db: Session = Depends(get_db)):
    wf.ensure_defaults(db)
    db.commit()
    rows = db.query(WorkCenter).order_by(WorkCenter.display_order, WorkCenter.id).all()
    return [_center_out(db, c) for c in rows]


@work_center_router.get("/staff", response_model=List[StaffOut])
def list_staff(db: Session = Depends(get_db)):
    """Active employees and the work centers each belongs to (used by the assign boxes; open to every signed-in user)."""
    members = {}
    for uid, cid in db.query(user_work_centers.c.user_id, user_work_centers.c.work_center_id).all():
        members.setdefault(uid, []).append(cid)
    users = db.query(User).filter(User.is_active.is_(True)).order_by(User.name).all()
    return [StaffOut(id=u.id, name=u.name, role=u.role.value, work_center_ids=sorted(members.get(u.id, []))) for u in users]


@work_center_router.post("/", response_model=WorkCenterOut, status_code=status.HTTP_201_CREATED, dependencies=admin_only)
def create_work_center(data: WorkCenterIn, db: Session = Depends(get_db)):
    wf.ensure_defaults(db)
    if db.query(WorkCenter.id).filter(func.lower(WorkCenter.name) == data.name.strip().lower()).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"A work center called '{data.name}' already exists")
    row = WorkCenter(**{**data.model_dump(), "name": data.name.strip()})
    db.add(row)
    db.commit()
    db.refresh(row)
    return _center_out(db, row)


@work_center_router.put("/{center_id}", response_model=WorkCenterOut, dependencies=admin_only)
def update_work_center(center_id: int, data: WorkCenterUpdate, db: Session = Depends(get_db)):
    row = _center(db, center_id)
    changes = data.model_dump(exclude_unset=True)
    name = changes.get("name")
    if name and db.query(WorkCenter.id).filter(func.lower(WorkCenter.name) == name.strip().lower(), WorkCenter.id != center_id).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"A work center called '{name}' already exists")
    for key, value in changes.items():
        setattr(row, key, value.strip() if key == "name" and value else value)
    db.commit()
    db.refresh(row)
    return _center_out(db, row)


@work_center_router.put("/{center_id}/members", response_model=WorkCenterOut, dependencies=admin_only)
def set_members(center_id: int, data: MembersIn, db: Session = Depends(get_db)):
    row = _center(db, center_id)
    users = db.query(User).filter(User.id.in_(data.user_ids)).all() if data.user_ids else []
    if len(users) != len(set(data.user_ids)):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="One of the employees was not found")
    row.members = users
    db.commit()
    db.refresh(row)
    return _center_out(db, row)


@work_center_router.delete("/{center_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=admin_only)
def delete_work_center(center_id: int, db: Session = Depends(get_db)):
    row = _center(db, center_id)
    in_use = db.query(JobStep.id).filter(JobStep.work_center_id == center_id).first() or db.query(WorkflowTemplateStep.id).filter(WorkflowTemplateStep.work_center_id == center_id).first()
    if in_use:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="This work center is used by workflows or job cards. Switch it off instead of deleting it.")
    db.delete(row)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This work center is in use. Switch it off instead.")
    return None


# ---- workflow templates -----------------------------------------------------------------------------------
def _template_out(db: Session, category: Optional[ProductCategory], template: Optional[WorkflowTemplate], default: WorkflowTemplate) -> TemplateOut:
    source = template if template is not None else default
    steps = [
        TemplateStepOut(id=s.id, position=s.position, name=s.name, kind=s.kind, stage=s.stage, work_center_id=s.work_center_id,
                        work_center_name=s.work_center.name if s.work_center is not None else None)
        for s in source.steps
    ]
    return TemplateOut(category_id=category.id if category else None, category_name=category.name if category else "All other services (default)",
                       is_custom=template is not None or category is None, steps=steps)


@template_router.get("/", response_model=List[TemplateOut])
def list_templates(db: Session = Depends(get_db)):
    wf.ensure_defaults(db)
    db.commit()
    default = db.query(WorkflowTemplate).filter(WorkflowTemplate.category_id.is_(None)).first()
    own = {t.category_id: t for t in db.query(WorkflowTemplate).filter(WorkflowTemplate.category_id.isnot(None)).all()}
    out = [_template_out(db, None, default, default)]
    for category in db.query(ProductCategory).order_by(ProductCategory.name).all():
        out.append(_template_out(db, category, own.get(category.id), default))
    return out


def _validate_steps(db: Session, data: TemplateIn) -> None:
    ids = {c.id for c in db.query(WorkCenter.id).all()}
    for step in data.steps:
        if step.kind not in STEP_KINDS:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unknown step type '{step.kind}'")
        if step.stage not in wf.WORKING_STAGES:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unknown stage '{step.stage}'")
        if step.work_center_id is not None and step.work_center_id not in ids:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Work center not found")


def _save_template(db: Session, category_id: Optional[int], data: TemplateIn) -> None:
    _validate_steps(db, data)
    template = db.query(WorkflowTemplate).filter(
        WorkflowTemplate.category_id == category_id if category_id is not None else WorkflowTemplate.category_id.is_(None)
    ).first()
    if template is None:
        template = WorkflowTemplate(category_id=category_id)
        db.add(template)
        db.flush()
    template.steps.clear()
    db.flush()
    for position, step in enumerate(data.steps, start=1):
        template.steps.append(WorkflowTemplateStep(position=position, name=step.name.strip(), kind=step.kind, stage=step.stage, work_center_id=step.work_center_id))
    db.commit()


@template_router.put("/default", response_model=List[TemplateOut], dependencies=admin_only)
def save_default_template(data: TemplateIn, db: Session = Depends(get_db)):
    wf.ensure_defaults(db)
    _save_template(db, None, data)
    return list_templates(db)


@template_router.put("/{category_id}", response_model=List[TemplateOut], dependencies=admin_only)
def save_service_template(category_id: int, data: TemplateIn, db: Session = Depends(get_db)):
    if not db.query(ProductCategory.id).filter(ProductCategory.id == category_id).first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found")
    wf.ensure_defaults(db)
    _save_template(db, category_id, data)
    return list_templates(db)


@template_router.delete("/{category_id}", response_model=List[TemplateOut], dependencies=admin_only)
def reset_service_template(category_id: int, db: Session = Depends(get_db)):
    """Back to the default workflow for this service. Jobs already running keep their steps."""
    template = db.query(WorkflowTemplate).filter(WorkflowTemplate.category_id == category_id).first()
    if template is not None:
        db.delete(template)
        db.commit()
    return list_templates(db)


# ---- steps of a job card -------------------------------------------------------------------------------------
def _job(db: Session, job_id: int) -> JobCard:
    row = db.query(JobCard).filter(JobCard.id == job_id).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job card not found")
    return row


def _step(db: Session, step_id: int) -> JobStep:
    row = db.query(JobStep).filter(JobStep.id == step_id).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Step not found")
    return row


def _steps_out(db: Session, job: JobCard, user: User) -> List[dict]:
    centers = wf.center_ids_of(db, user)
    return [wf.step_view(db, s, user, centers) for s in sorted(job.steps, key=lambda s: s.position)]


@steps_router.get("/job-cards/{job_id}/steps", response_model=List[StepOut])
def get_steps(job_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    job = _job(db, job_id)
    if not job.steps:
        wf.create_steps_for_job(db, job, user)
        db.commit()
        db.refresh(job)
    return _steps_out(db, job, user)


@steps_router.get("/job-cards/{job_id}/timeline", response_model=List[EventOut])
def get_timeline(job_id: int, db: Session = Depends(get_db)):
    return wf.timeline(db, _job(db, job_id))


@steps_router.post("/job-cards/{job_id}/steps", response_model=List[StepOut], status_code=status.HTTP_201_CREATED)
def add_step(job_id: int, data: StepAdd, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    job = _job(db, job_id)
    if not job.steps:
        wf.create_steps_for_job(db, job, user)
    wf.add_step(db, job, user, data.name, data.work_center_id, data.kind, data.stage, data.after_step_id)
    db.commit()
    db.refresh(job)
    return _steps_out(db, job, user)


def _after(db: Session, step: JobStep, user: User) -> dict:
    db.commit()
    db.refresh(step)
    job = step.job_card
    db.refresh(job)
    return wf.step_view(db, step, user)


@steps_router.put("/job-steps/{step_id}", response_model=StepOut)
def edit_step(step_id: int, data: StepUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    step = wf.update_step(db, _step(db, step_id), user, data.model_dump(exclude_unset=True))
    return _after(db, step, user)


@steps_router.delete("/job-steps/{step_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_step(step_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    wf.delete_step(db, _step(db, step_id), user)
    db.commit()
    return None


@steps_router.post("/job-steps/{step_id}/start", response_model=StepOut)
def start_step(step_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return _after(db, wf.start_step(db, _step(db, step_id), user), user)


@steps_router.post("/job-steps/{step_id}/complete", response_model=StepOut)
def complete_step(step_id: int, data: NoteIn = NoteIn(), db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return _after(db, wf.complete_step(db, _step(db, step_id), user, data.note), user)


@steps_router.post("/job-steps/{step_id}/hold", response_model=StepOut)
def hold_step(step_id: int, data: HoldIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return _after(db, wf.hold_step(db, _step(db, step_id), user, data.reason), user)


@steps_router.post("/job-steps/{step_id}/reopen", response_model=StepOut)
def reopen_step(step_id: int, data: NoteIn = NoteIn(), db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return _after(db, wf.reopen_step(db, _step(db, step_id), user, data.note), user)


@steps_router.post("/job-steps/{step_id}/skip", response_model=StepOut)
def skip_step(step_id: int, data: NoteIn = NoteIn(), db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return _after(db, wf.skip_step(db, _step(db, step_id), user, data.note), user)


@steps_router.post("/job-steps/{step_id}/assign", response_model=StepOut)
def assign_step(step_id: int, data: AssignIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return _after(db, wf.assign_step(db, _step(db, step_id), user, data.user_id), user)


@steps_router.post("/job-steps/{step_id}/claim", response_model=StepOut)
def claim_step(step_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """'I will do this one': an employee takes an open step of their work center."""
    return _after(db, wf.assign_step(db, _step(db, step_id), user, user.id), user)


@steps_router.post("/job-steps/{step_id}/move", response_model=StepOut)
def move_step(step_id: int, data: MoveIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    step = _step(db, step_id)
    wf.move_step(db, step, user, data.direction)
    return _after(db, step, user)


@steps_router.post("/job-steps/{step_id}/send-out", response_model=StepOut)
def send_out(step_id: int, data: SendOutIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    step = _step(db, step_id)
    wf.send_out(db, step, user, data.vendor_id, data.vendor_name, data.cost_amount, data.customer_price, data.expected_date, data.description)
    return _after(db, step, user)


# ---- my work, board, monitoring --------------------------------------------------------------------------------
@production_router.get("/my-work")
def my_work(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    wf.ensure_defaults(db)
    db.commit()
    return wf.my_work(db, user)


@production_router.get("/board")
def board(overdue: bool = Query(False), urgent: bool = Query(False), work_center_id: Optional[int] = Query(None),
          db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    wf.ensure_defaults(db)
    db.commit()
    return wf.board(db, user, overdue, urgent, work_center_id)


@production_router.get("/summary")
def summary(db: Session = Depends(get_db), user: User = Depends(require_role(UserRole.admin, UserRole.counter, UserRole.accounts))):
    wf.ensure_defaults(db)
    db.commit()
    return wf.summary(db)
