from datetime import date
from io import BytesIO
from typing import List, Tuple

from sqlalchemy import func
from sqlalchemy.orm import Session
from openpyxl import Workbook

from app.models.invoice import Invoice, InvoiceItem
from app.models.product import Product


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


def sales_report_excel(
    start: date,
    end: date,
    breakdown: List[dict],
    grand_total: float,
    by_order_type: List[dict],
    products: List[dict],
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
    ws.append(["By Order Type"])
    ws.append(["Order Type", "Invoice Count", "Total (Rs.)"])
    for row in by_order_type:
        ws.append([row["order_type"], row["invoice_count"], row["total"]])

    ws.append([])
    ws.append(["Top Products"])
    ws.append(["Product", "Quantity", "Total (Rs.)"])
    for row in products:
        ws.append([row["product_name"], row["quantity"], row["total"]])

    for column_cells in ws.columns:
        length = max(len(str(cell.value)) if cell.value is not None else 0 for cell in column_cells)
        ws.column_dimensions[column_cells[0].column_letter].width = max(12, length + 2)

    buffer = BytesIO()
    wb.save(buffer)
    return buffer.getvalue()
