from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user, require_role
from app.models.user import User, UserRole
from app.schemas.credit_debit import CreditDebitIn, CreditDebitOut, CreditDebitSummary, CreditDebitUpdate
from app.services import credit_debit_service as svc

# The Credit / Debit book is for the counter, accounts and the owner (not production staff).
book_roles = [Depends(require_role(UserRole.admin, UserRole.accounts, UserRole.counter))]
delete_roles = [Depends(require_role(UserRole.admin, UserRole.accounts))]

router = APIRouter(prefix="/credit-debit", tags=["credit-debit"], dependencies=book_roles)


@router.get("/entries", response_model=List[CreditDebitOut])
def list_entries(
    kind: Optional[str] = Query(None, description="credit | debit (blank = both)"),
    name: Optional[str] = Query(None, description="part of a name"),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    limit: int = Query(2000, ge=1, le=20000),
    db: Session = Depends(get_db),
):
    return svc.list_entries(db, kind, name, date_from, date_to, limit)


@router.post("/entries", response_model=CreditDebitOut, status_code=status.HTTP_201_CREATED)
def add_entry(payload: CreditDebitIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return svc.create_entry(db, payload, current_user.name or current_user.email)


@router.put("/entries/{entry_id}", response_model=CreditDebitOut)
def edit_entry(entry_id: int, payload: CreditDebitUpdate, db: Session = Depends(get_db)):
    return svc.update_entry(db, entry_id, payload)


@router.delete("/entries/{entry_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=delete_roles)
def remove_entry(entry_id: int, db: Session = Depends(get_db)):
    svc.delete_entry(db, entry_id)
    return None


@router.get("/names", response_model=List[str])
def names(db: Session = Depends(get_db)):
    return svc.known_names(db)


@router.get("/summary", response_model=CreditDebitSummary)
def get_summary(name: Optional[str] = None, date_from: Optional[date] = None, date_to: Optional[date] = None, db: Session = Depends(get_db)):
    return svc.summary(db, name, date_from, date_to)


@router.get("/export")
def export_excel(name: Optional[str] = None, date_from: Optional[date] = None, date_to: Optional[date] = None, db: Session = Depends(get_db)):
    data = svc.entries_excel(db, name, date_from, date_to)
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="credit-debit-book.xlsx"'},
    )
