from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.cash_ledger import CashTransaction, CashTxnType, ChequeTransaction
from app.models.user import User
from app.schemas.cash_ledger import (
    CashTransactionCreate, CashTransactionOut, CashSummary,
    ChequeTransactionCreate, ChequeTransactionOut, ChequeStatusUpdate,
)

# Every route here is Admin/Accounts-only -- gated at router registration in
# main.py (accounts_and_admin), not per-route, since the whole module is
# money-visibility-restricted, unlike purchases/inventory where reads stay
# open to any staff.
router = APIRouter(prefix="/cash-ledger", tags=["cash-ledger"])


@router.get("/summary", response_model=CashSummary)
def get_cash_summary(db: Session = Depends(get_db)):
    txns = db.query(CashTransaction).order_by(CashTransaction.id.desc()).all()
    cash_in_hand = 0.0
    cash_in_bank = 0.0
    for t in txns:
        if t.txn_type == CashTxnType.receipt:
            cash_in_hand += t.amount
        elif t.txn_type == CashTxnType.payment:
            cash_in_hand -= t.amount
        elif t.txn_type == CashTxnType.bank_deposit:
            cash_in_hand -= t.amount
            cash_in_bank += t.amount
    return CashSummary(cash_in_hand=cash_in_hand, cash_in_bank=cash_in_bank, transactions=txns)


@router.post("/transactions", response_model=CashTransactionOut, status_code=status.HTTP_201_CREATED)
def create_cash_transaction(data: CashTransactionCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    txn = CashTransaction(**data.model_dump(exclude={"created_by"}), created_by=data.created_by or user.name)
    db.add(txn)
    db.commit()
    db.refresh(txn)
    return txn


@router.get("/cheques", response_model=List[ChequeTransactionOut])
def get_cheques(db: Session = Depends(get_db)):
    return db.query(ChequeTransaction).order_by(ChequeTransaction.id.desc()).all()


@router.post("/cheques", response_model=ChequeTransactionOut, status_code=status.HTTP_201_CREATED)
def create_cheque(data: ChequeTransactionCreate, db: Session = Depends(get_db)):
    cheque = ChequeTransaction(**data.model_dump())
    db.add(cheque)
    db.commit()
    db.refresh(cheque)
    return cheque


@router.patch("/cheques/{cheque_id}/status", response_model=ChequeTransactionOut)
def update_cheque_status(cheque_id: int, data: ChequeStatusUpdate, db: Session = Depends(get_db)):
    cheque = db.query(ChequeTransaction).filter(ChequeTransaction.id == cheque_id).first()
    if not cheque:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cheque not found")
    cheque.status = data.status
    db.commit()
    db.refresh(cheque)
    return cheque
