from datetime import date
from io import BytesIO
from typing import List, Tuple

from sqlalchemy import func
from sqlalchemy.orm import Session
from openpyxl import Workbook

from app.models.invoice import Invoice


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


def sales_report_excel(start: date, end: date, breakdown: List[dict], grand_total: float) -> bytes:
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

    for column_cells in ws.columns:
        length = max(len(str(cell.value)) if cell.value is not None else 0 for cell in column_cells)
        ws.column_dimensions[column_cells[0].column_letter].width = max(12, length + 2)

    buffer = BytesIO()
    wb.save(buffer)
    return buffer.getvalue()
