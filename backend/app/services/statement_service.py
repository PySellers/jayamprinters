"""Financial statement: sales, purchases, outsourcing and other expenses side by side, with profit and margin."""
from datetime import date, timedelta
from io import BytesIO

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.cash_ledger import CashTransaction, CashTxnType
from app.models.invoice import Invoice, Payment
from app.models.outsource import OutsourceJob, OutsourceStatus
from app.models.purchase import Purchase, PurchasePayment

GROUPS = ("day", "week", "month")


def _period_start(d: date, group: str) -> date:
    if group == "week":
        return d - timedelta(days=d.weekday())  # Monday
    if group == "month":
        return d.replace(day=1)
    return d


def _period_label(start: date, group: str) -> str:
    if group == "week":
        return f"{start.isoformat()} to {(start + timedelta(days=6)).isoformat()}"
    if group == "month":
        return start.strftime("%b %Y")
    return start.isoformat()


def _money(value) -> float:
    return round(float(value or 0.0), 2)


def _margin(profit: float, sales: float):
    return round(profit / sales * 100, 1) if sales else None


def financial_statement(db: Session, start: date, end: date, group: str = "day") -> dict:
    """Profit and loss for [start, end], grouped by day / week / month.

    Sales are shown without GST (the tax collected is the government's money and is listed separately). Costs are
    the stock purchases, the outside companies' charges for outsourced jobs (cancelled ones left out) and the other
    cash expenses recorded in the cash ledger. Profit = sales - costs. The collected / paid-out columns follow the
    money actually moved in the period."""
    if group not in GROUPS:
        group = "day"
    periods: dict = {}

    def bucket(d: date) -> dict:
        key = _period_start(d, group)
        if key not in periods:
            periods[key] = {
                "period_start": key.isoformat(),
                "label": _period_label(key, group),
                "invoices": 0,
                "sales": 0.0,
                "gst_collected": 0.0,
                "sales_incl_gst": 0.0,
                "purchases": 0.0,
                "outsource_cost": 0.0,
                "other_expenses": 0.0,
                "collected": 0.0,
                "paid_out": 0.0,
            }
        return periods[key]

    for inv in db.query(Invoice).filter(Invoice.invoice_date >= start, Invoice.invoice_date <= end).all():
        b = bucket(inv.invoice_date)
        b["invoices"] += 1
        b["sales"] += inv.subtotal or 0.0
        b["gst_collected"] += inv.tax_amount or 0.0
        b["sales_incl_gst"] += inv.grand_total or 0.0

    for pur in db.query(Purchase).filter(Purchase.purchase_date >= start, Purchase.purchase_date <= end).all():
        bucket(pur.purchase_date)["purchases"] += pur.total_amount or 0.0

    jobs = (
        db.query(OutsourceJob)
        .filter(OutsourceJob.sent_date >= start, OutsourceJob.sent_date <= end, OutsourceJob.status != OutsourceStatus.cancelled)
        .all()
    )
    for job in jobs:
        bucket(job.sent_date)["outsource_cost"] += job.cost_amount or 0.0

    expenses = (
        db.query(CashTransaction)
        .filter(
            CashTransaction.txn_type == CashTxnType.payment,
            func.date(CashTransaction.created_at) >= start,
            func.date(CashTransaction.created_at) <= end,
        )
        .all()
    )
    for txn in expenses:
        b = bucket(txn.created_at.date())
        b["other_expenses"] += txn.amount or 0.0
        b["paid_out"] += txn.amount or 0.0

    for pay in db.query(Payment).filter(Payment.payment_date >= start, Payment.payment_date <= end).all():
        bucket(pay.payment_date)["collected"] += pay.amount or 0.0
    for pay in db.query(PurchasePayment).filter(PurchasePayment.payment_date >= start, PurchasePayment.payment_date <= end).all():
        bucket(pay.payment_date)["paid_out"] += pay.amount or 0.0

    rows = []
    for key in sorted(periods):
        r = periods[key]
        for field, value in list(r.items()):
            if isinstance(value, float):
                r[field] = _money(value)
        r["total_costs"] = _money(r["purchases"] + r["outsource_cost"] + r["other_expenses"])
        r["profit"] = _money(r["sales"] - r["total_costs"])
        r["margin_percent"] = _margin(r["profit"], r["sales"])
        rows.append(r)

    totals = {
        field: _money(sum(r[field] for r in rows))
        for field in (
            "sales", "gst_collected", "sales_incl_gst", "purchases", "outsource_cost", "other_expenses",
            "total_costs", "profit", "collected", "paid_out",
        )
    }
    totals["invoices"] = sum(r["invoices"] for r in rows)
    totals["margin_percent"] = _margin(totals["profit"], totals["sales"])

    # what is still owed, as of the end date
    receivable = sum(
        max((i.grand_total or 0.0) - (i.amount_paid or 0.0), 0.0) for i in db.query(Invoice).filter(Invoice.invoice_date <= end).all()
    )
    payable = sum(
        max((p.total_amount or 0.0) - (p.paid_amount or 0.0), 0.0) for p in db.query(Purchase).filter(Purchase.purchase_date <= end).all()
    )
    outsource_due = sum(
        max((j.cost_amount or 0.0) - (j.amount_paid or 0.0), 0.0)
        for j in db.query(OutsourceJob).filter(OutsourceJob.sent_date <= end, OutsourceJob.status != OutsourceStatus.cancelled).all()
    )
    return {
        "start": start.isoformat(),
        "end": end.isoformat(),
        "group": group,
        "rows": rows,
        "totals": totals,
        "receivable": _money(receivable),
        "payable": _money(payable + outsource_due),
    }


def statement_excel(data: dict) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "Financial Statement"
    ws.append(["Financial Statement", f"{data['start']} to {data['end']}", f"by {data['group']}"])
    ws["A1"].font = Font(bold=True, size=14)
    ws.append([])
    ws.append([
        "Period", "Invoices", "Sales (excl. GST)", "GST collected", "Sales (incl. GST)", "Purchases", "Outsource cost",
        "Other expenses", "Total costs", "Profit", "Margin %", "Money collected", "Money paid out",
    ])
    for cell in ws[3]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="1A237E")
        cell.alignment = Alignment(horizontal="center", wrap_text=True)

    def line(label, r):
        return [
            label, r["invoices"], r["sales"], r["gst_collected"], r["sales_incl_gst"], r["purchases"], r["outsource_cost"],
            r["other_expenses"], r["total_costs"], r["profit"], r["margin_percent"] if r["margin_percent"] is not None else "",
            r["collected"], r["paid_out"],
        ]

    for r in data["rows"]:
        ws.append(line(r["label"], r))
    ws.append(line("TOTAL", data["totals"]))
    for cell in ws[ws.max_row]:
        cell.font = Font(bold=True)
    ws.append([])
    ws.append(["Still to receive from customers (as of end date)", "", data["receivable"]])
    ws.append(["Still to pay to suppliers / outside companies (as of end date)", "", data["payable"]])
    ws.append(["Profit = sales (excluding GST) minus purchases, outsourced job cost and other cash expenses."])

    for column_cells in ws.columns:
        length = max(len(str(c.value)) if c.value is not None else 0 for c in column_cells[2:])
        ws.column_dimensions[column_cells[0].column_letter].width = max(12, min(length + 2, 34))
    ws.column_dimensions["A"].width = 26

    buffer = BytesIO()
    wb.save(buffer)
    return buffer.getvalue()
