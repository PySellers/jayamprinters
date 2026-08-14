import enum
from datetime import datetime

from sqlalchemy import Column, Integer, String, Float, Date, DateTime, Enum

from app.core.database import Base


class CashTxnType(str, enum.Enum):
    receipt = "receipt"       # cash coming in (counter sale, manual entry)
    payment = "payment"       # cash going out (expense, not tied to a purchase bill)
    bank_deposit = "bank_deposit"  # cash moved from the drawer into the bank


class CashTransaction(Base):
    """A hand-entered running cash register, same idea as a physical daybook:
    Cash in Hand = sum(receipts) - sum(payments) - sum(bank_deposits).
    Cash in Bank = sum(bank_deposits). Deliberately NOT auto-generated from
    invoice/purchase payments in this pass -- not every invoice payment is
    cash (UPI/card/credit go straight to the bank or stay as receivable), so
    auto-posting every payment method here would overstate cash-in-hand.
    Staff record actual cash movements directly; wiring specific payment
    methods through automatically is a reasonable next step once real usage
    shows which methods should feed it."""
    __tablename__ = "cash_transactions"

    id = Column(Integer, primary_key=True, index=True)
    txn_type = Column(Enum(CashTxnType), nullable=False)
    amount = Column(Float, nullable=False)
    note = Column(String, nullable=True)
    created_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class ChequeDirection(str, enum.Enum):
    issued = "issued"        # we wrote a cheque to pay someone
    deposited = "deposited"  # we received a cheque and banked it


class ChequeStatus(str, enum.Enum):
    pending = "pending"
    cleared = "cleared"
    bounced = "bounced"


class ChequeTransaction(Base):
    __tablename__ = "cheque_transactions"

    id = Column(Integer, primary_key=True, index=True)
    direction = Column(Enum(ChequeDirection), nullable=False)
    cheque_no = Column(String, nullable=False)
    cheque_date = Column(Date, nullable=True)
    bank_branch = Column(String, nullable=True)
    deposit_date = Column(Date, nullable=True)
    amount = Column(Float, nullable=False)
    status = Column(Enum(ChequeStatus), nullable=False, default=ChequeStatus.pending)
    party_name = Column(String, nullable=True)  # who issued it to us / who we issued it to
    notes = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
