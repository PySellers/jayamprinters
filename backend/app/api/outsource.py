from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import require_role
from app.models.customer import Customer
from app.models.outsource import OutsourceJob, OutsourceStatus
from app.models.purchase import Vendor
from app.models.user import UserRole
from app.schemas.outsource import OutsourceCreate, OutsourceOut, OutsourcePayment, OutsourceUpdate
from app.services.numbering import next_number

router = APIRouter(prefix="/outsource", tags=["outsource"])
write_roles = [Depends(require_role(UserRole.admin, UserRole.accounts, UserRole.counter))]


def _out(job: OutsourceJob) -> OutsourceOut:
    out = OutsourceOut.model_validate(job)
    out.margin = round((job.customer_price or 0) - (job.cost_amount or 0), 2)
    out.balance_to_pay = round(max((job.cost_amount or 0) - (job.amount_paid or 0), 0), 2)
    if not out.vendor_name and job.vendor is not None:
        out.vendor_name = job.vendor.name
    return out


def _check_links(db: Session, data: dict) -> None:
    if data.get("vendor_id") and not db.query(Vendor.id).filter(Vendor.id == data["vendor_id"]).first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found")
    if data.get("customer_id") and not db.query(Customer.id).filter(Customer.id == data["customer_id"]).first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")


@router.get("/", response_model=List[OutsourceOut])
def list_jobs(skip: int = 0, limit: int = 5000, db: Session = Depends(get_db)):
    jobs = db.query(OutsourceJob).order_by(OutsourceJob.id.desc()).offset(skip).limit(limit).all()
    return [_out(j) for j in jobs]


@router.get("/{job_id}", response_model=OutsourceOut)
def get_job(job_id: int, db: Session = Depends(get_db)):
    job = db.query(OutsourceJob).filter(OutsourceJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Outsource job not found")
    return _out(job)


@router.post("/", response_model=OutsourceOut, status_code=status.HTTP_201_CREATED, dependencies=write_roles)
def create_job(data: OutsourceCreate, db: Session = Depends(get_db)):
    values = data.model_dump()
    _check_links(db, values)
    if not values.get("vendor_id") and not (values.get("vendor_name") or "").strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Say which company the work goes to")
    job = OutsourceJob(**values, job_number=next_number(db, OutsourceJob.job_number, "OS"))
    db.add(job)
    db.commit()
    db.refresh(job)
    return _out(job)


@router.put("/{job_id}", response_model=OutsourceOut, dependencies=write_roles)
def update_job(job_id: int, data: OutsourceUpdate, db: Session = Depends(get_db)):
    job = db.query(OutsourceJob).filter(OutsourceJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Outsource job not found")
    changes = data.model_dump(exclude_unset=True)
    _check_links(db, changes)
    for key, value in changes.items():
        setattr(job, key, value)
    if changes.get("status") == OutsourceStatus.received and not job.received_date:
        from app.services.time_utils import today_ist
        job.received_date = today_ist()
    db.commit()
    db.refresh(job)
    return _out(job)


@router.post("/{job_id}/payments", response_model=OutsourceOut, dependencies=write_roles)
def pay_job(job_id: int, data: OutsourcePayment, db: Session = Depends(get_db)):
    job = db.query(OutsourceJob).filter(OutsourceJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Outsource job not found")
    balance = round((job.cost_amount or 0) - (job.amount_paid or 0), 2)
    if round(data.amount, 2) > balance:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Payment of Rs. {data.amount:.2f} is more than the balance owed (Rs. {max(balance, 0):.2f})",
        )
    job.amount_paid = round((job.amount_paid or 0) + data.amount, 2)
    db.commit()
    db.refresh(job)
    return _out(job)


@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_role(UserRole.admin))])
def delete_job(job_id: int, db: Session = Depends(get_db)):
    job = db.query(OutsourceJob).filter(OutsourceJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Outsource job not found")
    db.delete(job)
    db.commit()
    return None
