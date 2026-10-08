"""Indian Standard Time helpers (fixed +05:30 offset, so no tz database is needed on Windows)."""
from datetime import date, datetime, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30))


def now_ist() -> datetime:
    return datetime.now(IST)


def today_ist() -> date:
    return now_ist().date()


def utc_naive_to_ist(value: datetime) -> datetime:
    """created_at columns store naive UTC; convert for display."""
    return value.replace(tzinfo=timezone.utc).astimezone(IST)