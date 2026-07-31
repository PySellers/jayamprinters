from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.cash_ledger import CashSummary, ChequeEntry
from app.services.cash_ledger_service import cash_summary, cheque_list

router = APIRouter(prefix="/cash-ledger", tags=["cash-ledger"])


@router.get("/summary", response_model=CashSummary)
def get_cash_summary(db: Session = Depends(get_db)):
    return cash_summary(db)


@router.get("/cheques", response_model=List[ChequeEntry])
def get_cheques(db: Session = Depends(get_db)):
    return cheque_list(db)
