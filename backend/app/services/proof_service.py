"""Design proofs of a job card: Proof 1, Proof 2 ... as many as the customer needs, each with a due time,
a status and the person looking after it."""
from datetime import date, datetime
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.job_card import JobCard
from app.models.job_proof import JobProof, PROOF_STATUSES
from app.models.user import User
from app.services.time_utils import today_ist
from app.services import workflow_service as wf

PROOF_STATUS_LABEL = {
    "scheduled": "Not shown yet",
    "sent": "Shown to the customer",
    "approved": "Approved",
    "changes": "Changes asked",
}


def proof_view(proof: JobProof) -> Dict[str, Any]:
    overdue = bool(
        proof.status in ("scheduled", "sent") and proof.due_date and proof.due_date < today_ist()
    )
    return {
        "id": proof.id,
        "job_card_id": proof.job_card_id,
        "number": proof.number,
        "label": f"Proof {proof.number}",
        "due_date": proof.due_date,
        "due_time": proof.due_time,
        "status": proof.status,
        "status_label": PROOF_STATUS_LABEL.get(proof.status, proof.status),
        "handled_by": proof.handled_by,
        "handled_by_name": proof.handler.name if proof.handler is not None else None,
        "notes": proof.notes,
        "sent_at": proof.sent_at,
        "decided_at": proof.decided_at,
        "overdue": overdue,
        # set when adding / moving this proof pushed the job's delivery date to the proof's day
        "delivery_moved_to": getattr(proof, "delivery_moved_to", None),
    }


def proofs_summary(job: JobCard) -> Dict[str, Any]:
    """What the dashboard shows about a job's proofs: how many, how many approved, and the one to watch."""
    proofs = sorted(job.proofs, key=lambda p: p.number)
    approved = [p for p in proofs if p.status == "approved"]
    pending = [p for p in proofs if p.status in ("scheduled", "sent", "changes")]
    watch = pending[0] if pending else (proofs[-1] if proofs else None)
    text = None
    if watch is not None:
        when = ""
        if watch.due_date:
            when = f" - {watch.due_date.strftime('%d %b')}{(' ' + watch.due_time) if watch.due_time else ''}"
        text = f"Proof {watch.number}: {PROOF_STATUS_LABEL.get(watch.status, watch.status)}{when}"
    return {
        "proofs_total": len(proofs),
        "proofs_approved": len(approved),
        "proof_status": watch.status if watch is not None else None,
        "proof_text": text,
        "proof_overdue": bool(watch is not None and proof_view(watch)["overdue"]),
    }


def create_proofs_from_order(db: Session, job: JobCard, quotation) -> None:
    """Proof 1 (and Proof 2 when given) of the order become proofs of the job card."""
    if job.proofs or quotation is None:
        return
    slots = [(quotation.proof1_date, quotation.proof1_time)]
    if quotation.proof2_date is not None:
        slots.append((quotation.proof2_date, quotation.proof2_time))
    for extra in quotation.extra_proofs or []:  # Proof 3, 4 ... asked for with the order
        try:
            slots.append((date.fromisoformat(str(extra.get("date"))), extra.get("time")))
        except (TypeError, ValueError):
            continue
    for number, (day, time) in enumerate(slots, start=1):
        db.add(JobProof(job_card_id=job.id, number=number, due_date=day, due_time=time or None, status="scheduled"))
    db.flush()


def list_proofs(job: JobCard) -> List[Dict[str, Any]]:
    return [proof_view(p) for p in sorted(job.proofs, key=lambda p: p.number)]


def last_proof_day(job: JobCard) -> Optional[date]:
    """The latest due day among the proofs of the job (the delivery can be on that day or later)."""
    days = [p.due_date for p in job.proofs if p.due_date is not None]
    return max(days) if days else None


def sync_delivery(db: Session, job: JobCard, user: Optional[User] = None) -> Optional[date]:
    """A delivery date before the last proof is not possible: move it to the last proof's day. Returns the new day when it moved."""
    last = last_proof_day(job)
    if last is None or (job.delivery_date is not None and job.delivery_date >= last):
        return None
    job.delivery_date = last
    sheet = dict(job.sheet_data or {})
    if sheet.get("delivery_date"):
        sheet["delivery_date"] = last.isoformat()
        job.sheet_data = sheet
    wf.log(db, job, None, user, "delivery_moved", f"Delivery date moved to {last:%d-%m-%Y} (the last proof)")
    return last


def add_proof(db: Session, job: JobCard, user: Optional[User], due_date=None, due_time=None, notes=None, handled_by=None) -> JobProof:
    number = max([p.number for p in job.proofs], default=0) + 1
    proof = JobProof(job_card_id=job.id, number=number, due_date=due_date, due_time=due_time or None,
                     notes=notes, handled_by=handled_by, status="scheduled")
    db.add(proof)
    db.flush()
    wf.log(db, job, None, user, "proof_added", f"Proof {number} planned")
    db.refresh(job)
    proof.delivery_moved_to = sync_delivery(db, job, user)
    return proof


def update_proof(db: Session, proof: JobProof, user: Optional[User], changes: Dict[str, Any]) -> JobProof:
    job = db.query(JobCard).filter(JobCard.id == proof.job_card_id).first()
    new_status = changes.pop("status", None)
    for key, value in changes.items():
        setattr(proof, key, value)
    if new_status is not None and new_status != proof.status:
        if new_status not in PROOF_STATUSES:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown proof status")
        proof.status = new_status
        now = datetime.utcnow()
        if new_status == "sent":
            proof.sent_at = now
            proof.decided_at = None
        elif new_status in ("approved", "changes"):
            proof.decided_at = now
            if proof.sent_at is None:
                proof.sent_at = now
        else:
            proof.sent_at = None
            proof.decided_at = None
        if job is not None:
            wf.log(db, job, None, user, f"proof_{new_status}", f"Proof {proof.number}: {PROOF_STATUS_LABEL[new_status]}")
    if job is not None and "due_date" in changes:
        db.flush()
        db.refresh(job)
        proof.delivery_moved_to = sync_delivery(db, job, user)
    return proof
