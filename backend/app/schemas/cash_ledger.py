from datetime import date
from typing import Optional

from pydantic import BaseModel

from app.models.invoice import ChequeStatus


class CashSummary(BaseModel):
    cash_in_hand: float
    cash_in_bank: float
    cash_received: float
    cash_paid_out: float
    bank_received: float
    bank_paid_out: float


class ChequeEntry(BaseModel):
    id: int
    direction: str
    amount: float
    cheque_number: Optional[str] = None
    cheque_date: Optional[date] = None
    issued_branch: Optional[str] = None
    cheque_status: Optional[ChequeStatus] = None
    cheque_deposit_date: Optional[date] = None
    reference_number: Optional[str] = None
    payment_date: date
