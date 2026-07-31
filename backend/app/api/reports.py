from datetime import date

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.services.report_service import (
    avg_job_turnaround_days, category_breakdown, order_type_breakdown, payment_method_breakdown,
    period_comparison, quotation_funnel, sales_breakdown, sales_report_excel, top_products,
)

router = APIRouter(prefix="/reports", tags=["reports"])


def _build_report(db: Session, start: date, end: date) -> dict:
    grand_total, breakdown = sales_breakdown(db, start, end)
    return {
        "start": start,
        "end": end,
        "grand_total": grand_total,
        "breakdown": breakdown,
        "by_order_type": order_type_breakdown(db, start, end),
        "top_products": top_products(db, start, end),
        "by_category": category_breakdown(db, start, end),
        "by_payment_method": payment_method_breakdown(db, start, end),
        "comparison": period_comparison(db, start, end),
        "quotation_funnel": quotation_funnel(db, start, end),
        "avg_job_turnaround_days": avg_job_turnaround_days(db, start, end),
    }


@router.get("/sales")
def get_sales_report(start: date = Query(...), end: date = Query(...), db: Session = Depends(get_db)):
    return _build_report(db, start, end)


@router.get("/sales/export")
def export_sales_report(start: date = Query(...), end: date = Query(...), db: Session = Depends(get_db)):
    report = _build_report(db, start, end)
    xlsx_bytes = sales_report_excel(
        start, end,
        report["breakdown"], report["grand_total"], report["by_order_type"], report["top_products"],
        report["by_category"], report["by_payment_method"], report["comparison"],
        report["quotation_funnel"], report["avg_job_turnaround_days"],
    )
    filename = f"sales-report-{start.isoformat()}-to-{end.isoformat()}.xlsx"
    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
