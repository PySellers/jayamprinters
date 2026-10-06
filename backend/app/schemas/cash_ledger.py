from pydantic import BaseModel
from typing import List, Optional
from datetime import date, datetime

from app.models.cash_ledger import CashTxnType, ChequeDirection, ChequeStatus


class CashTransactionCreate(BaseModel):
    txn_type: CashTxnType
    amount: float
    note: Optional[str] = None
    created_by: Optional[str] = None


class CashTransactionOut(CashTransactionCreate):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class CashSummary(BaseModel):
    cash_in_hand: float
    cash_in_bank: float
    transactions: List[CashTransactionOut]


class ChequeTransactionCreate(BaseModel):
    direction: ChequeDirection
    cheque_no: str
    cheque_date: Optional[date] = None
    bank_branch: Optional[str] = None
    deposit_date: Optional[date] = None
    amount: float
    party_name: Optional[str] = None
    notes: Optional[str] = None


class ChequeStatusUpdate(BaseModel):
    status: ChequeStatus


class ChequeTransactionOut(ChequeTransactionCreate):
    id: int
    status: ChequeStatus
    created_at: datetime

    class Config:
        from_attributes = True
