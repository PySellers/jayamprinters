from datetime import date

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.services.report_service import order_type_breakdown, sales_breakdown, sales_report_excel, top_products

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/sales")
def get_sales_report(start: date = Query(...), end: date = Query(...), db: Session = Depends(get_db)):
    grand_total, breakdown = sales_breakdown(db, start, end)
    return {
        "start": start,
        "end": end,
        "grand_total": grand_total,
        "breakdown": breakdown,
        "by_order_type": order_type_breakdown(db, start, end),
        "top_products": top_products(db, start, end),
    }


@router.get("/sales/export")
def export_sales_report(start: date = Query(...), end: date = Query(...), db: Session = Depends(get_db)):
    grand_total, breakdown = sales_breakdown(db, start, end)
    by_order_type = order_type_breakdown(db, start, end)
    products = top_products(db, start, end)
    xlsx_bytes = sales_report_excel(start, end, breakdown, grand_total, by_order_type, products)
    filename = f"sales-report-{start.isoformat()}-to-{end.isoformat()}.xlsx"
    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
