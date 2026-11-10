"""Account statement of the shop, like a bank statement: one line per transaction with a serial number, date,
particulars, debit, credit and a running balance, grouped by day or week with a sub-total and the number of invoices /
purchases in each group, and a grand total at the end.

basis = 'accrual' (default): a sales invoice is a CREDIT (money to come), a purchase / outsourced job / expense a DEBIT.
basis = 'cash': only money that actually moved - payments received are CREDITS, payments made are DEBITS."""
from datetime import date, datetime, timedelta
from io import BytesIO
from typing import Any, Dict, List

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.cash_ledger import CashTransaction, CashTxnType
from app.models.customer import Customer
from app.models.invoice import Invoice, Payment
from app.models.outsource import OutsourceJob, OutsourceStatus, OutsourcePayment
from app.models.purchase import Purchase, PurchasePayment, Vendor
from app.services.statement_service import GROUPS, _period_label, _period_start


def _r(value) -> float:
    return round(float(value or 0.0), 2)


def _method(value) -> str:
    if value is None:
        return ""
    text = getattr(value, "value", value)
    return str(text).replace("_", " ").title()


def _pay_details(p) -> str:
    bits = [_method(p.method)]
    if getattr(p, "reference_number", None):
        bits.append(f"ref {p.reference_number}")
    if getattr(p, "upi_id", None):
        bits.append(f"UPI {p.upi_id}")
    if getattr(p, "bank_details", None):
        bits.append(p.bank_details)
    return ", ".join(b for b in bits if b)


def _entries(db: Session, start: date, end: date, basis: str) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    customers = {c.id: (c.billing_person_name or c.name) for c in db.query(Customer).all()}
    vendors = {v.id: v.name for v in db.query(Vendor).all()}

    def add(day, kind, particulars, ref, debit=0.0, credit=0.0, at=None):
        out.append({"date": day, "kind": kind, "particulars": particulars, "ref": ref or "", "debit": _r(debit), "credit": _r(credit), "_at": at or datetime.combine(day, datetime.min.time())})

    if basis == "cash":
        for pay in db.query(Payment).filter(Payment.payment_date >= start, Payment.payment_date <= end).all():
            inv = pay.invoice
            who = customers.get(inv.customer_id, "") if inv else ""
            add(pay.payment_date, "receipt", f"Received from {who} for {inv.invoice_number if inv else '-'}" + (" (advance)" if pay.is_advance else "") + f" - {_pay_details(pay)}",
                inv.invoice_number if inv else "", credit=pay.amount, at=pay.created_at)
        for pay in db.query(PurchasePayment).filter(PurchasePayment.payment_date >= start, PurchasePayment.payment_date <= end).all():
            pur = pay.purchase
            add(pay.payment_date, "purchase_payment", f"Paid to {vendors.get(pur.vendor_id, '-') if pur else '-'} for {pur.purchase_number if pur else '-'} - {_pay_details(pay)}",
                pur.purchase_number if pur else "", debit=pay.amount, at=pay.created_at)
        paid_rows: Dict[int, float] = {}
        for pay in db.query(OutsourcePayment).filter(OutsourcePayment.payment_date >= start, OutsourcePayment.payment_date <= end).all():
            job = db.query(OutsourceJob).filter(OutsourceJob.id == pay.job_id).first()
            paid_rows[pay.job_id] = paid_rows.get(pay.job_id, 0.0) + pay.amount
            add(pay.payment_date, "outsource_payment", f"Paid to {(job.vendor_name or vendors.get(job.vendor_id, '-')) if job else '-'} for outsourced job {job.job_number if job else '-'} - {_pay_details(pay)}",
                job.job_number if job else "", debit=pay.amount, at=pay.created_at)
        for txn in db.query(CashTransaction).filter(func.date(CashTransaction.created_at) >= start, func.date(CashTransaction.created_at) <= end).all():
            if txn.txn_type == CashTxnType.bank_deposit:
                continue
            note = txn.note or ("Cash received" if txn.txn_type == CashTxnType.receipt else "Expense")
            if txn.txn_type == CashTxnType.receipt:
                add(txn.created_at.date(), "cash_receipt", f"Cash received - {note}", "", credit=txn.amount, at=txn.created_at)
            else:
                add(txn.created_at.date(), "expense", f"Expense - {note}", "", debit=txn.amount, at=txn.created_at)
        return out

    for inv in db.query(Invoice).filter(Invoice.invoice_date >= start, Invoice.invoice_date <= end).all():
        names = ""
        gst = f", GST {inv.tax_amount:,.2f}" if inv.with_gst and inv.tax_amount else ""
        add(inv.invoice_date, "sale", f"Sales - {'GST invoice' if inv.with_gst else 'Cash bill'} {inv.bill_no or inv.invoice_number} to {customers.get(inv.customer_id, '-')} ({len(inv.items)} item{'s' if len(inv.items) != 1 else ''}{gst})" + names,
            inv.invoice_number, credit=inv.grand_total, at=inv.created_at)
    for pur in db.query(Purchase).filter(Purchase.purchase_date >= start, Purchase.purchase_date <= end).all():
        add(pur.purchase_date, "purchase", f"Purchase from {vendors.get(pur.vendor_id, '-')} ({len(pur.items)} item{'s' if len(pur.items) != 1 else ''})", pur.purchase_number, debit=pur.total_amount, at=pur.created_at)
    for job in db.query(OutsourceJob).filter(OutsourceJob.sent_date >= start, OutsourceJob.sent_date <= end, OutsourceJob.status != OutsourceStatus.cancelled).all():
        add(job.sent_date, "outsource", f"Outsourced job {job.service} to {job.vendor_name or vendors.get(job.vendor_id, '-')}", job.job_number, debit=job.cost_amount, at=job.created_at)
    for txn in db.query(CashTransaction).filter(func.date(CashTransaction.created_at) >= start, func.date(CashTransaction.created_at) <= end).all():
        if txn.txn_type == CashTxnType.payment:
            add(txn.created_at.date(), "expense", f"Expense - {txn.note or 'cash payment'}", "", debit=txn.amount, at=txn.created_at)
        elif txn.txn_type == CashTxnType.receipt:
            add(txn.created_at.date(), "cash_receipt", f"Cash received - {txn.note or 'counter'}", "", credit=txn.amount, at=txn.created_at)
    return out


KIND_LABEL = {
    "sale": "Sales", "purchase": "Purchases", "outsource": "Outsourced jobs", "expense": "Expenses", "cash_receipt": "Cash receipts",
    "receipt": "Payments received", "purchase_payment": "Purchase payments", "outsource_payment": "Outsource payments",
}


def account_statement(db: Session, start: date, end: date, group: str = "day", basis: str = "accrual") -> Dict[str, Any]:
    group = group if group in GROUPS else "day"
    basis = basis if basis in ("accrual", "cash") else "accrual"
    entries = sorted(_entries(db, start, end, basis), key=lambda e: (e["date"], e["_at"]))
    periods: Dict[date, Dict[str, Any]] = {}
    serial = 0
    balance = 0.0
    for entry in entries:
        key = _period_start(entry["date"], group)
        period = periods.setdefault(key, {"period_start": key.isoformat(), "label": _period_label(key, group), "entries": [], "counts": {}, "debit": 0.0, "credit": 0.0})
        serial += 1
        balance = round(balance + entry["credit"] - entry["debit"], 2)
        period["entries"].append({
            "sr": serial, "date": entry["date"].isoformat(), "kind": entry["kind"], "particulars": entry["particulars"], "ref": entry["ref"],
            "debit": entry["debit"], "credit": entry["credit"], "balance": balance,
        })
        period["counts"][entry["kind"]] = period["counts"].get(entry["kind"], 0) + 1
        period["debit"] += entry["debit"]
        period["credit"] += entry["credit"]
    rows = []
    total_counts: Dict[str, int] = {}
    for key in sorted(periods):
        p = periods[key]
        p["debit"], p["credit"] = _r(p["debit"]), _r(p["credit"])
        p["closing"] = p["entries"][-1]["balance"] if p["entries"] else 0.0
        p["summary"] = ", ".join(f"{n} {KIND_LABEL.get(k, k).lower()}" for k, n in p["counts"].items())
        for k, n in p["counts"].items():
            total_counts[k] = total_counts.get(k, 0) + n
        rows.append(p)
    debit = _r(sum(p["debit"] for p in rows))
    credit = _r(sum(p["credit"] for p in rows))
    return {
        "start": start.isoformat(), "end": end.isoformat(), "group": group, "basis": basis,
        "periods": rows,
        "totals": {"entries": serial, "debit": debit, "credit": credit, "balance": _r(credit - debit),
                   "counts": total_counts, "summary": ", ".join(f"{n} {KIND_LABEL.get(k, k).lower()}" for k, n in total_counts.items())},
    }


def account_statement_excel(data: Dict[str, Any]) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "Account Statement"
    ws.append(["Sri Jayam Printers - account statement", f"{data['start']} to {data['end']}", f"by {data['group']}", "money in / out only" if data["basis"] == "cash" else "sales and purchases"])
    ws["A1"].font = Font(bold=True, size=14)
    ws.append([])
    ws.append(["Sr.No", "Date", "Particulars", "Ref", "Debit", "Credit", "Balance"])
    for cell in ws[3]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="1A237E")
        cell.alignment = Alignment(horizontal="center")
    for p in data["periods"]:
        ws.append([None, None, f"{p['label']}  -  {p['summary']}"])
        for cell in ws[ws.max_row]:
            cell.font = Font(bold=True)
            cell.fill = PatternFill("solid", fgColor="E8EAF6")
        for e in p["entries"]:
            ws.append([e["sr"], e["date"], e["particulars"], e["ref"], e["debit"] or None, e["credit"] or None, e["balance"]])
        ws.append([None, None, f"Total for {p['label']}", None, p["debit"], p["credit"], p["closing"]])
        for cell in ws[ws.max_row]:
            cell.font = Font(bold=True)
    t = data["totals"]
    ws.append([])
    ws.append([None, None, f"GRAND TOTAL ({t['summary']})", None, t["debit"], t["credit"], t["balance"]])
    for cell in ws[ws.max_row]:
        cell.font = Font(bold=True, size=12)
    ws.column_dimensions["A"].width = 8
    ws.column_dimensions["B"].width = 12
    ws.column_dimensions["C"].width = 80
    ws.column_dimensions["D"].width = 14
    for col in "EFG":
        ws.column_dimensions[col].width = 15
    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()
