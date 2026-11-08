"""Design proofs of a job card: Proof 1, Proof 2 ... as many as the customer needs, each with a due time,
a status and the person looking after it."""
from datetime import datetime
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
    for number, day, time in ((1, quotation.proof1_date, quotation.proof1_time), (2, quotation.proof2_date, quotation.proof2_time)):
        if day is not None or (number == 1):
            db.add(JobProof(job_card_id=job.id, number=number, due_date=day, due_time=time or None, status="scheduled"))
    db.flush()


def list_proofs(job: JobCard) -> List[Dict[str, Any]]:
    return [proof_view(p) for p in sorted(job.proofs, key=lambda p: p.number)]


def add_proof(db: Session, job: JobCard, user: Optional[User], due_date=None, due_time=None, notes=None, handled_by=None) -> JobProof:
    number = max([p.number for p in job.proofs], default=0) + 1
    proof = JobProof(job_card_id=job.id, number=number, due_date=due_date, due_time=due_time or None,
                     notes=notes, handled_by=handled_by, status="scheduled")
    db.add(proof)
    db.flush()
    wf.log(db, job, None, user, "proof_added", f"Proof {number} planned")
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
    return proof
