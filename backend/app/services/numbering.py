"""Document numbers (INV-00012, JC-00007, PUR-00003...) that stay unique even after records are deleted."""

from sqlalchemy import text
from sqlalchemy.orm import Session


def next_number(db: Session, column, prefix: str, width: int = 5) -> str:
    """Highest existing number for `prefix` plus one.

    Counting rows is wrong once anything has been deleted (it hands out a number that is
    already taken), so the highest number is used. A transaction-scoped advisory lock stops two
    people saving at the same moment from getting the same number; it is released on commit.
    """
    db.execute(text("select pg_advisory_xact_lock(hashtext(:key))"), {"key": f"docno:{prefix}"})
    existing = db.query(column).filter(column.like(f"{prefix}-%")).all()
    numbers = [int(v[0].split("-", 1)[1]) for v in existing if v[0].split("-", 1)[1].isdigit()]
    return f"{prefix}-{(max(numbers) if numbers else 0) + 1:0{width}d}"
