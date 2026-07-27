"""
Sales reporting: daily / weekly / monthly / yearly, aggregated in Python
(rather than DB-specific date functions) so this works identically on SQLite
in dev and Postgres in production. Powers the "live monitoring" / reports tab
of the admin dashboard.
"""
from collections import OrderedDict
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Order, JobCard, OrderStatus, CashTransaction, CashTxnType
from app.schemas import ReportSummary, ReportPoint

router = APIRouter(prefix="/reports", tags=["reports"])

DEFAULT_PERIODS = {"daily": 14, "weekly": 8, "monthly": 12, "yearly": 5}


def _bucket_label(dt: datetime, range_: str) -> str:
    if range_ == "daily":
        return dt.strftime("%Y-%m-%d")
    if range_ == "weekly":
        iso = dt.isocalendar()
        return f"{iso[0]}-W{iso[1]:02d}"
    if range_ == "monthly":
        return dt.strftime("%Y-%m")
    if range_ == "yearly":
        return dt.strftime("%Y")
    raise ValueError(range_)


def _bucket_start(now: datetime, range_: str, offset: int) -> datetime:
    """Start-of-bucket timestamp for `offset` periods back from now (0 = current)."""
    if range_ == "daily":
        d = (now - timedelta(days=offset)).date()
        return datetime(d.year, d.month, d.day)
    if range_ == "weekly":
        # start of the ISO week `offset` weeks back
        base = now - timedelta(weeks=offset)
        monday = base - timedelta(days=base.weekday())
        return datetime(monday.year, monday.month, monday.day)
    if range_ == "monthly":
        month = now.month - offset
        year = now.year
        while month <= 0:
            month += 12
            year -= 1
        return datetime(year, month, 1)
    if range_ == "yearly":
        return datetime(now.year - offset, 1, 1)
    raise ValueError(range_)


@router.get("/summary", response_model=ReportSummary)
def summary(
    range_type: str = Query("daily", alias="range"),
    periods: int | None = None,
    db: Session = Depends(get_db),
):
    if range_type not in DEFAULT_PERIODS:
        raise HTTPException(status_code=400, detail="range must be one of daily, weekly, monthly, yearly")
    n_periods = periods or DEFAULT_PERIODS[range_type]

    orders = db.query(Order).filter(Order.status == OrderStatus.ACTIVE).all()
    order_totals = {}  # order_id -> (created_at, total)
    for o in orders:
        items = db.query(JobCard).filter(JobCard.order_id == o.id).all()
        total = sum((float(i.computed_total) for i in items if i.computed_total is not None), 0.0)
        created = o.created_at or datetime.utcnow()
        order_totals[o.id] = (created, total)

    now = datetime.utcnow()
    # Build ordered buckets from oldest to newest
    buckets = OrderedDict()
    for offset in reversed(range(n_periods)):
        start = _bucket_start(now, range_type, offset)
        label = _bucket_label(start, range_type)
        buckets[label] = {"order_count": 0, "total_sales": 0.0}

    for created, total in order_totals.values():
        label = _bucket_label(created, range_type)
        if label in buckets:
            buckets[label]["order_count"] += 1
            buckets[label]["total_sales"] += total

    points = [ReportPoint(label=lbl, order_count=v["order_count"], total_sales=round(v["total_sales"], 2))
              for lbl, v in buckets.items()]
    grand_total = round(sum(p.total_sales for p in points), 2)
    total_orders = sum(p.order_count for p in points)

    return ReportSummary(range=range_type, points=points, grand_total=grand_total, total_orders=total_orders)


@router.get("/expenses", response_model=ReportSummary)
def expenses(
    range_type: str = Query("daily", alias="range"),
    periods: int | None = None,
    db: Session = Depends(get_db),
):
    """Same daily/weekly/monthly/yearly bucketing as /reports/summary, but for
    cash PAYMENT transactions -- the PDF's 'Expense Graph' alongside its Sales
    Graph. Bank deposits are a cash-position transfer, not a business expense,
    so they aren't counted here."""
    if range_type not in DEFAULT_PERIODS:
        raise HTTPException(status_code=400, detail="range must be one of daily, weekly, monthly, yearly")
    n_periods = periods or DEFAULT_PERIODS[range_type]

    txns = db.query(CashTransaction).filter(CashTransaction.txn_type == CashTxnType.PAYMENT).all()

    now = datetime.utcnow()
    buckets = OrderedDict()
    for offset in reversed(range(n_periods)):
        start = _bucket_start(now, range_type, offset)
        label = _bucket_label(start, range_type)
        buckets[label] = {"order_count": 0, "total_sales": 0.0}

    for t in txns:
        created = t.created_at or now
        label = _bucket_label(created, range_type)
        if label in buckets:
            buckets[label]["order_count"] += 1
            buckets[label]["total_sales"] += float(t.amount)

    points = [ReportPoint(label=lbl, order_count=v["order_count"], total_sales=round(v["total_sales"], 2))
              for lbl, v in buckets.items()]
    grand_total = round(sum(p.total_sales for p in points), 2)
    total_orders = sum(p.order_count for p in points)

    return ReportSummary(range=range_type, points=points, grand_total=grand_total, total_orders=total_orders)
