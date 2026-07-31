from datetime import date, timedelta
from io import BytesIO
from typing import List, Tuple

from sqlalchemy import func
from sqlalchemy.orm import Session
from openpyxl import Workbook

from app.models.invoice import Invoice, InvoiceItem, Payment
from app.models.job_card import JobCard, JobCardStatus
from app.models.product import Product, ProductCategory
from app.models.purchase import Purchase
from app.models.quotation import Quotation

GRANULARITY_TO_POSTGRES_FIELD = {"daily": "day", "weekly": "week", "monthly": "month", "yearly": "year"}


def _graph_series(db: Session, model, date_column, amount_column, granularity: str, start: date, end: date) -> List[dict]:
    field = GRANULARITY_TO_POSTGRES_FIELD.get(granularity, "day")
    bucket = func.date_trunc(field, date_column)
    rows = (
        db.query(bucket.label("bucket"), func.coalesce(func.sum(amount_column), 0.0).label("total"))
        .filter(date_column >= start, date_column <= end)
        .group_by("bucket")
        .order_by("bucket")
        .all()
    )
    return [{"period": row.bucket.date().isoformat(), "total": float(row.total)} for row in rows]


def sales_graph(db: Session, granularity: str, start: date, end: date) -> List[dict]:
    return _graph_series(db, Invoice, Invoice.invoice_date, Invoice.grand_total, granularity, start, end)


def expense_graph(db: Session, granularity: str, start: date, end: date) -> List[dict]:
    """"Expense" here means money spent on purchases - there's no separate operating-expense
    ledger (rent, salaries, etc.) in this system, only material purchases."""
    return _graph_series(db, Purchase, Purchase.purchase_date, Purchase.grand_total, granularity, start, end)


def sales_breakdown(db: Session, start: date, end: date) -> Tuple[float, List[dict]]:
    """Returns (grand_total_sum, [{date, invoice_count, total}, ...]) for invoices in [start, end]."""
    rows = (
        db.query(
            Invoice.invoice_date.label("day"),
            func.count(Invoice.id).label("invoice_count"),
            func.coalesce(func.sum(Invoice.grand_total), 0.0).label("total"),
        )
        .filter(Invoice.invoice_date >= start, Invoice.invoice_date <= end)
        .group_by(Invoice.invoice_date)
        .order_by(Invoice.invoice_date.asc())
        .all()
    )
    breakdown = [
        {"date": row.day.isoformat(), "invoice_count": row.invoice_count, "total": float(row.total)}
        for row in rows
    ]
    grand_total = sum(row["total"] for row in breakdown)
    return grand_total, breakdown


def order_type_breakdown(db: Session, start: date, end: date) -> List[dict]:
    """Returns [{order_type, invoice_count, total}, ...] - walk-in vs. phone/remote split."""
    rows = (
        db.query(
            Invoice.order_type.label("order_type"),
            func.count(Invoice.id).label("invoice_count"),
            func.coalesce(func.sum(Invoice.grand_total), 0.0).label("total"),
        )
        .filter(Invoice.invoice_date >= start, Invoice.invoice_date <= end)
        .group_by(Invoice.order_type)
        .all()
    )
    return [
        {"order_type": row.order_type.value, "invoice_count": row.invoice_count, "total": float(row.total)}
        for row in rows
    ]


def top_products(db: Session, start: date, end: date, limit: int = 10) -> List[dict]:
    """Returns [{product_name, quantity, total}, ...] ranked by revenue, for invoices in [start, end]."""
    rows = (
        db.query(
            Product.name.label("product_name"),
            func.coalesce(func.sum(InvoiceItem.quantity), 0).label("quantity"),
            func.coalesce(func.sum(InvoiceItem.total_price), 0.0).label("total"),
        )
        .join(Invoice, Invoice.id == InvoiceItem.invoice_id)
        .join(Product, Product.id == InvoiceItem.product_id)
        .filter(Invoice.invoice_date >= start, Invoice.invoice_date <= end)
        .group_by(Product.name)
        .order_by(func.coalesce(func.sum(InvoiceItem.total_price), 0.0).desc())
        .limit(limit)
        .all()
    )
    return [
        {"product_name": row.product_name, "quantity": row.quantity, "total": float(row.total)}
        for row in rows
    ]


def category_breakdown(db: Session, start: date, end: date) -> List[dict]:
    """Returns [{category_name, quantity, total}, ...] ranked by revenue, for invoices in [start, end].

    Products with no category (category_id is null) are grouped under "Uncategorized" rather than
    silently dropped - an inner join would hide them entirely.
    """
    rows = (
        db.query(
            func.coalesce(ProductCategory.name, "Uncategorized").label("category_name"),
            func.coalesce(func.sum(InvoiceItem.quantity), 0).label("quantity"),
            func.coalesce(func.sum(InvoiceItem.total_price), 0.0).label("total"),
        )
        .join(Invoice, Invoice.id == InvoiceItem.invoice_id)
        .join(Product, Product.id == InvoiceItem.product_id)
        .outerjoin(ProductCategory, ProductCategory.id == Product.category_id)
        .filter(Invoice.invoice_date >= start, Invoice.invoice_date <= end)
        .group_by(func.coalesce(ProductCategory.name, "Uncategorized"))
        .order_by(func.coalesce(func.sum(InvoiceItem.total_price), 0.0).desc())
        .all()
    )
    return [
        {"category_name": row.category_name, "quantity": row.quantity, "total": float(row.total)}
        for row in rows
    ]


def payment_method_breakdown(db: Session, start: date, end: date) -> List[dict]:
    """Returns [{method, payment_count, total}, ...] - cash actually collected in [start, end],
    by when the payment was recorded (not when the invoice was raised)."""
    rows = (
        db.query(
            Payment.method.label("method"),
            func.count(Payment.id).label("payment_count"),
            func.coalesce(func.sum(Payment.amount), 0.0).label("total"),
        )
        .filter(Payment.payment_date >= start, Payment.payment_date <= end)
        .group_by(Payment.method)
        .order_by(func.coalesce(func.sum(Payment.amount), 0.0).desc())
        .all()
    )
    return [
        {"method": row.method.value, "payment_count": row.payment_count, "total": float(row.total)}
        for row in rows
    ]


def period_comparison(db: Session, start: date, end: date) -> dict:
    """Compares this period's invoiced total against the immediately preceding period of the
    same length (e.g. this week vs. last week), so staff can see growth/decline at a glance."""
    period_days = (end - start).days + 1
    prev_end = start - timedelta(days=1)
    prev_start = prev_end - timedelta(days=period_days - 1)

    current_total = (
        db.query(func.coalesce(func.sum(Invoice.grand_total), 0.0))
        .filter(Invoice.invoice_date >= start, Invoice.invoice_date <= end)
        .scalar()
    )
    previous_total = (
        db.query(func.coalesce(func.sum(Invoice.grand_total), 0.0))
        .filter(Invoice.invoice_date >= prev_start, Invoice.invoice_date <= prev_end)
        .scalar()
    )
    current_total = float(current_total)
    previous_total = float(previous_total)
    if previous_total > 0:
        percent_change = round((current_total - previous_total) / previous_total * 100, 1)
    else:
        percent_change = None

    return {
        "current_total": current_total,
        "previous_total": previous_total,
        "previous_start": prev_start.isoformat(),
        "previous_end": prev_end.isoformat(),
        "percent_change": percent_change,
    }


def quotation_funnel(db: Session, start: date, end: date) -> List[dict]:
    """Returns [{status, count}, ...] for quotations created in [start, end] - how many make it
    from draft through to converted."""
    rows = (
        db.query(Quotation.status.label("status"), func.count(Quotation.id).label("count"))
        .filter(func.date(Quotation.created_at) >= start, func.date(Quotation.created_at) <= end)
        .group_by(Quotation.status)
        .all()
    )
    return [{"status": row.status.value, "count": row.count} for row in rows]


def avg_job_turnaround_days(db: Session, start: date, end: date) -> float | None:
    """Average days from job card creation to delivery, for jobs delivered in [start, end].
    None (not 0) when there's nothing delivered yet, so the frontend can show "no data" instead
    of a misleading zero."""
    rows = (
        db.query(JobCard.created_at, JobCard.updated_at)
        .filter(
            JobCard.status == JobCardStatus.delivered,
            func.date(JobCard.updated_at) >= start,
            func.date(JobCard.updated_at) <= end,
        )
        .all()
    )
    if not rows:
        return None
    total_days = sum((row.updated_at - row.created_at).total_seconds() / 86400 for row in rows)
    return round(total_days / len(rows), 1)


def sales_report_excel(
    start: date,
    end: date,
    breakdown: List[dict],
    grand_total: float,
    by_order_type: List[dict],
    products: List[dict],
    categories: List[dict],
    payment_methods: List[dict],
    comparison: dict,
    funnel: List[dict],
    avg_turnaround: float | None,
) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "Sales Report"

    ws.append(["Sales Report", f"{start.isoformat()} to {end.isoformat()}"])
    ws.append([])
    ws.append(["Date", "Invoice Count", "Total (Rs.)"])
    for row in breakdown:
        ws.append([row["date"], row["invoice_count"], row["total"]])
    ws.append([])
    ws.append(["Grand Total", "", grand_total])

    ws.append([])
    ws.append(["vs. Previous Period", f"{comparison['previous_start']} to {comparison['previous_end']}"])
    ws.append(["This Period", "Previous Period", "% Change"])
    ws.append([
        comparison["current_total"],
        comparison["previous_total"],
        comparison["percent_change"] if comparison["percent_change"] is not None else "n/a",
    ])

    ws.append([])
    ws.append(["By Order Type"])
    ws.append(["Order Type", "Invoice Count", "Total (Rs.)"])
    for row in by_order_type:
        ws.append([row["order_type"], row["invoice_count"], row["total"]])

    ws.append([])
    ws.append(["By Payment Method"])
    ws.append(["Method", "Payment Count", "Total (Rs.)"])
    for row in payment_methods:
        ws.append([row["method"], row["payment_count"], row["total"]])

    ws.append([])
    ws.append(["By Category"])
    ws.append(["Category", "Quantity", "Total (Rs.)"])
    for row in categories:
        ws.append([row["category_name"], row["quantity"], row["total"]])

    ws.append([])
    ws.append(["Top Products"])
    ws.append(["Product", "Quantity", "Total (Rs.)"])
    for row in products:
        ws.append([row["product_name"], row["quantity"], row["total"]])

    ws.append([])
    ws.append(["Quotation Funnel"])
    ws.append(["Status", "Count"])
    for row in funnel:
        ws.append([row["status"], row["count"]])

    ws.append([])
    ws.append(["Avg. Job Turnaround (days)", avg_turnaround if avg_turnaround is not None else "n/a"])

    for column_cells in ws.columns:
        length = max(len(str(cell.value)) if cell.value is not None else 0 for cell in column_cells)
        ws.column_dimensions[column_cells[0].column_letter].width = max(12, length + 2)

    buffer = BytesIO()
    wb.save(buffer)
    return buffer.getvalue()
