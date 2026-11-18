"""Credit / Debit book: simple money-in / money-out entries kept by name, with date and name filters and an Excel copy."""
from datetime import date
from io import BytesIO
from typing import Optional

from fastapi import HTTPException, status
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from sqlalchemy import func
from sqlalchemy.orm import Query, Session

from app.models.credit_debit import CreditDebitEntry
from app.schemas.credit_debit import CreditDebitIn, CreditDebitUpdate
from app.services.time_utils import today_ist


def filtered(db: Session, kind: Optional[str] = None, name: Optional[str] = None,
             date_from: Optional[date] = None, date_to: Optional[date] = None) -> Query:
    q = db.query(CreditDebitEntry)
    if kind:
        if kind not in ("credit", "debit"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="kind must be credit or debit")
        q = q.filter(CreditDebitEntry.kind == kind)
    if name and name.strip():
        q = q.filter(CreditDebitEntry.name.ilike(f"%{name.strip()}%"))
    if date_from and date_to and date_from > date_to:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="The 'from' date is after the 'to' date")
    if date_from:
        q = q.filter(CreditDebitEntry.entry_date >= date_from)
    if date_to:
        q = q.filter(CreditDebitEntry.entry_date <= date_to)
    return q


def list_entries(db: Session, kind=None, name=None, date_from=None, date_to=None, limit: int = 2000) -> list[CreditDebitEntry]:
    return (filtered(db, kind, name, date_from, date_to)
            .order_by(CreditDebitEntry.entry_date.desc(), CreditDebitEntry.id.desc()).limit(limit).all())


def _check_date(d: date) -> None:
    today = today_ist()
    if d > today.replace(year=today.year + 1):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="That date is too far ahead")


def create_entry(db: Session, payload: CreditDebitIn, created_by: Optional[str]) -> CreditDebitEntry:
    entry_date = payload.entry_date or today_ist()
    _check_date(entry_date)
    entry = CreditDebitEntry(kind=payload.kind, name=payload.name, amount=payload.amount, note=(payload.note or "").strip() or None,
                             entry_date=entry_date, created_by=created_by)
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def update_entry(db: Session, entry_id: int, payload: CreditDebitUpdate) -> CreditDebitEntry:
    entry = db.query(CreditDebitEntry).filter(CreditDebitEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entry not found")
    _check_date(payload.entry_date)
    entry.name, entry.amount, entry.entry_date = payload.name, payload.amount, payload.entry_date
    entry.note = (payload.note or "").strip() or None
    db.commit()
    db.refresh(entry)
    return entry


def delete_entry(db: Session, entry_id: int) -> None:
    entry = db.query(CreditDebitEntry).filter(CreditDebitEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entry not found")
    db.delete(entry)
    db.commit()


def known_names(db: Session) -> list[str]:
    """Names used before (most recent first) so the form can suggest them and the same person is spelled the same way."""
    rows = (db.query(CreditDebitEntry.name, func.max(CreditDebitEntry.id).label("last"))
            .group_by(CreditDebitEntry.name).order_by(func.max(CreditDebitEntry.id).desc()).limit(500).all())
    return [r[0] for r in rows]


def summary(db: Session, name=None, date_from=None, date_to=None) -> dict:
    """Totals of credit and debit for the filters, and the balance of every name (credit - debit)."""
    rows = filtered(db, None, name, date_from, date_to).all()
    credit = round(sum(r.amount for r in rows if r.kind == "credit"), 2)
    debit = round(sum(r.amount for r in rows if r.kind == "debit"), 2)
    people: dict = {}
    for r in rows:
        key = r.name.strip().lower()
        p = people.setdefault(key, {"name": r.name, "credit": 0.0, "debit": 0.0})
        p["credit" if r.kind == "credit" else "debit"] += r.amount
    by_name = sorted(
        ({"name": p["name"], "credit": round(p["credit"], 2), "debit": round(p["debit"], 2), "net": round(p["credit"] - p["debit"], 2)}
         for p in people.values()),
        key=lambda p: -abs(p["net"]),
    )
    return {
        "credit_total": credit, "debit_total": debit, "net": round(credit - debit, 2),
        "credit_count": sum(1 for r in rows if r.kind == "credit"), "debit_count": sum(1 for r in rows if r.kind == "debit"),
        "by_name": by_name,
    }


def entries_excel(db: Session, name=None, date_from=None, date_to=None) -> bytes:
    """Credit and Debit entries on two sheets (plus a per-name balance sheet), for the filters on screen."""
    wb = Workbook()
    head_fill = PatternFill("solid", fgColor="3D4FA3")
    head_font = Font(bold=True, color="FFFFFF")

    def sheet(title, kind, first=False):
        ws = wb.active if first else wb.create_sheet()
        ws.title = title
        ws.append(["Date", "Name", "Amount (Rs.)", "Note", "Entered by"])
        for cell in ws[1]:
            cell.fill, cell.font, cell.alignment = head_fill, head_font, Alignment(horizontal="center")
        total = 0.0
        for e in reversed(list_entries(db, kind, name, date_from, date_to, limit=20000)):
            ws.append([e.entry_date, e.name, e.amount, e.note or "", e.created_by or ""])
            ws.cell(row=ws.max_row, column=1).number_format = "dd-mm-yyyy"
            ws.cell(row=ws.max_row, column=3).number_format = "#,##0.00"
            total += e.amount
        ws.append(["", "Total", round(total, 2), "", ""])
        for cell in ws[ws.max_row]:
            cell.font = Font(bold=True)
        ws.cell(row=ws.max_row, column=3).number_format = "#,##0.00"
        for col, width in zip("ABCDE", (13, 32, 16, 46, 18)):
            ws.column_dimensions[col].width = width

    sheet("Credit", "credit", first=True)
    sheet("Debit", "debit")
    ws = wb.create_sheet("Balance by name")
    ws.append(["Name", "Credit (Rs.)", "Debit (Rs.)", "Credit - Debit (Rs.)"])
    for cell in ws[1]:
        cell.fill, cell.font, cell.alignment = head_fill, head_font, Alignment(horizontal="center")
    data = summary(db, name, date_from, date_to)
    for p in data["by_name"]:
        ws.append([p["name"], p["credit"], p["debit"], p["net"]])
    ws.append(["Total", data["credit_total"], data["debit_total"], data["net"]])
    for cell in ws[ws.max_row]:
        cell.font = Font(bold=True)
    for col, width in zip("ABCD", (32, 16, 16, 22)):
        ws.column_dimensions[col].width = width
    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()
