"""
Accounts / Finance module -- implements the rate-card PDF's "Sales Report"
page: Cash in Hand, Cash in Bank (cash deposits + full cheque lifecycle:
issued/deposited, cheque no., date, issuing branch, deposit date), Stock Value
(vendor bills: bill no., vendor name, cash value, paid/balance), and Low Stock.

Reads are open to any logged-in staff; writes (recording a transaction,
issuing/depositing a cheque, entering a vendor bill) are gated to Admin or
Accounts role so the ledger can't be edited from the shop floor.
"""
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    CashTransaction, CashTxnType, ChequeTransaction, ChequeDirection, ChequeStatus,
    VendorBill, InventoryItem, UserRole,
)
from app.schemas import (
    CashTransactionIn, CashTransactionOut, CashSummary,
    ChequeTransactionIn, ChequeTransactionOut, ChequeStatusUpdate,
    VendorBillIn, VendorBillOut, InventoryItemIn, InventoryItemOut,
)
from app.auth import require_role, get_current_user

router = APIRouter(prefix="/accounts", tags=["accounts"])

WRITE_ROLES = (UserRole.ADMIN, UserRole.ACCOUNTS)


# ----------------------------- Cash -----------------------------

@router.get("/cash", response_model=CashSummary)
def cash_summary(db: Session = Depends(get_db), user=Depends(get_current_user)):
    txns = db.query(CashTransaction).order_by(CashTransaction.id.desc()).all()
    cash_in_hand = Decimal("0")
    to_bank = Decimal("0")
    for t in txns:
        amt = Decimal(t.amount)
        if t.txn_type == CashTxnType.RECEIPT:
            cash_in_hand += amt
        elif t.txn_type == CashTxnType.PAYMENT:
            cash_in_hand -= amt
        elif t.txn_type == CashTxnType.BANK_DEPOSIT:
            cash_in_hand -= amt
            to_bank += amt
    return CashSummary(cash_in_hand=cash_in_hand, cash_moved_to_bank=to_bank, transactions=txns)


@router.post("/cash", response_model=CashTransactionOut, status_code=201)
def record_cash_transaction(
    payload: CashTransactionIn, db: Session = Depends(get_db),
    user=Depends(require_role(*WRITE_ROLES)),
):
    try:
        txn_type = CashTxnType(payload.txn_type)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"txn_type must be one of {[t.value for t in CashTxnType]}")
    txn = CashTransaction(
        txn_type=txn_type, amount=payload.amount, note=payload.note,
        created_by=payload.created_by or user.username,
    )
    db.add(txn)
    db.commit()
    db.refresh(txn)
    return txn


# ----------------------------- Cheques -----------------------------

@router.get("/cheques", response_model=list[ChequeTransactionOut])
def list_cheques(db: Session = Depends(get_db), user=Depends(get_current_user)):
    return db.query(ChequeTransaction).order_by(ChequeTransaction.id.desc()).all()


@router.post("/cheques", response_model=ChequeTransactionOut, status_code=201)
def create_cheque(
    payload: ChequeTransactionIn, db: Session = Depends(get_db),
    user=Depends(require_role(*WRITE_ROLES)),
):
    try:
        direction = ChequeDirection(payload.direction)
        status_ = ChequeStatus(payload.status)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid direction or status value")
    cheque = ChequeTransaction(
        direction=direction, cheque_no=payload.cheque_no, cheque_date=payload.cheque_date,
        bank_branch=payload.bank_branch, deposit_date=payload.deposit_date,
        amount=payload.amount, status=status_,
    )
    db.add(cheque)
    db.commit()
    db.refresh(cheque)
    return cheque


@router.patch("/cheques/{cheque_id}/status", response_model=ChequeTransactionOut)
def update_cheque_status(
    cheque_id: int, payload: ChequeStatusUpdate, db: Session = Depends(get_db),
    user=Depends(require_role(*WRITE_ROLES)),
):
    cheque = db.query(ChequeTransaction).filter(ChequeTransaction.id == cheque_id).first()
    if cheque is None:
        raise HTTPException(status_code=404, detail=f"Unknown cheque id {cheque_id}")
    try:
        cheque.status = ChequeStatus(payload.status)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"status must be one of {[s.value for s in ChequeStatus]}")
    db.commit()
    db.refresh(cheque)
    return cheque


# ----------------------------- Vendor bills / Stock value -----------------------------

@router.get("/vendor-bills", response_model=list[VendorBillOut])
def list_vendor_bills(db: Session = Depends(get_db), user=Depends(get_current_user)):
    bills = db.query(VendorBill).order_by(VendorBill.id.desc()).all()
    return [_bill_out(b) for b in bills]


@router.post("/vendor-bills", response_model=VendorBillOut, status_code=201)
def create_vendor_bill(
    payload: VendorBillIn, db: Session = Depends(get_db),
    user=Depends(require_role(*WRITE_ROLES)),
):
    bill = VendorBill(**payload.model_dump())
    db.add(bill)
    db.commit()
    db.refresh(bill)
    return _bill_out(bill)


def _bill_out(bill: VendorBill) -> VendorBillOut:
    return VendorBillOut(
        id=bill.id, bill_no=bill.bill_no, vendor_name=bill.vendor_name,
        cash_value=bill.cash_value, paid_amount=bill.paid_amount,
        balance=Decimal(bill.cash_value) - Decimal(bill.paid_amount),
        bill_date=bill.bill_date, created_at=bill.created_at,
    )


# ----------------------------- Inventory / Low stock -----------------------------

@router.get("/inventory", response_model=list[InventoryItemOut])
def list_inventory(db: Session = Depends(get_db), user=Depends(get_current_user)):
    items = db.query(InventoryItem).order_by(InventoryItem.name).all()
    return [_inv_out(i) for i in items]


@router.get("/inventory/low-stock", response_model=list[InventoryItemOut])
def low_stock(db: Session = Depends(get_db), user=Depends(get_current_user)):
    items = db.query(InventoryItem).all()
    return [_inv_out(i) for i in items if Decimal(i.current_qty) <= Decimal(i.reorder_threshold)]


@router.post("/inventory", response_model=InventoryItemOut, status_code=201)
def create_inventory_item(
    payload: InventoryItemIn, db: Session = Depends(get_db),
    user=Depends(require_role(*WRITE_ROLES)),
):
    item = InventoryItem(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return _inv_out(item)


def _inv_out(item: InventoryItem) -> InventoryItemOut:
    return InventoryItemOut(
        id=item.id, name=item.name, unit=item.unit,
        current_qty=item.current_qty, reorder_threshold=item.reorder_threshold,
        low_stock=Decimal(item.current_qty) <= Decimal(item.reorder_threshold),
    )
