from typing import List

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.invoice import Payment, PaymentMethod
from app.models.purchase import PurchasePayment

BANK_METHODS = [PaymentMethod.bank_transfer, PaymentMethod.upi, PaymentMethod.card, PaymentMethod.cheque]


def _sum(db: Session, model, methods: List[PaymentMethod]) -> float:
    total = (
        db.query(func.coalesce(func.sum(model.amount), 0.0))
        .filter(model.method.in_(methods))
        .scalar()
    )
    return float(total)


def cash_summary(db: Session) -> dict:
    """Cash in Hand = net of all cash-method payments (received minus paid out).
    Cash in Bank = net of everything else (UPI/card/bank transfer/cheque) - simplified,
    not a full double-entry ledger, but matches what the client's spec actually needs:
    two running totals plus a place to see outstanding cheques."""
    cash_in = _sum(db, Payment, [PaymentMethod.cash])
    cash_out = _sum(db, PurchasePayment, [PaymentMethod.cash])
    bank_in = _sum(db, Payment, BANK_METHODS)
    bank_out = _sum(db, PurchasePayment, BANK_METHODS)

    return {
        "cash_in_hand": round(cash_in - cash_out, 2),
        "cash_in_bank": round(bank_in - bank_out, 2),
        "cash_received": round(cash_in, 2),
        "cash_paid_out": round(cash_out, 2),
        "bank_received": round(bank_in, 2),
        "bank_paid_out": round(bank_out, 2),
    }


def cheque_list(db: Session) -> List[dict]:
    """All cheque-method payments (received from customers) and purchase payments (issued to
    vendors), unified into one list so staff can track the full cheque lifecycle in one place."""
    received = (
        db.query(Payment)
        .filter(Payment.method == PaymentMethod.cheque)
        .order_by(Payment.payment_date.desc())
        .all()
    )
    issued = (
        db.query(PurchasePayment)
        .filter(PurchasePayment.method == PaymentMethod.cheque)
        .order_by(PurchasePayment.payment_date.desc())
        .all()
    )

    def serialize(p, direction: str) -> dict:
        return {
            "id": p.id,
            "direction": direction,
            "amount": p.amount,
            "cheque_number": p.cheque_number,
            "cheque_date": p.cheque_date,
            "issued_branch": p.issued_branch,
            "cheque_status": p.cheque_status,
            "cheque_deposit_date": p.cheque_deposit_date,
            "reference_number": p.reference_number,
            "payment_date": p.payment_date,
        }

    rows = [serialize(p, "received") for p in received] + [serialize(p, "issued") for p in issued]
    rows.sort(key=lambda r: r["payment_date"], reverse=True)
    return rows
