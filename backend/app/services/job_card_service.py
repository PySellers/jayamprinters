from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from app.services.numbering import next_number
from typing import List

from datetime import date
from typing import Any, Dict

from app.models.quotation import Quotation, QuotationStatus
from app.models.job_card import JobCard, JobCardPriority
from app.models.invoice import Invoice
from app.models.delivery_challan import DeliveryChallan
from app.services.time_utils import utc_naive_to_ist
from app.services.workflow_service import create_steps_for_job
from app.services.proof_service import create_proofs_from_order
from app.services.job_sheet_service import merge_saved, prefilled_sheet, sheet_extras


def generate_job_number(db: Session) -> str:
    return next_number(db, JobCard.job_number, "JC")


def convert_quotation_to_job_cards(db: Session, quotation_id: int) -> List[JobCard]:
    quotation = db.query(Quotation).filter(Quotation.id == quotation_id).first()
    if not quotation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quotation not found")
    if quotation.status == QuotationStatus.converted:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Quotation already converted to job cards")

    job_cards = []
    for item in quotation.items:
        job_card = JobCard(
            job_number=generate_job_number(db),
            quotation_item_id=item.id,
            customer_id=quotation.customer_id,
            product_id=item.product_id,
            notes=item.spec_notes,
            delivery_date=quotation.delivery_date,
            priority=JobCardPriority(quotation.priority) if quotation.priority in [p.value for p in JobCardPriority] else JobCardPriority.medium,
        )
        db.add(job_card)
        db.flush()
        create_steps_for_job(db, job_card, log_event=True)
        create_proofs_from_order(db, job_card, quotation)
        job_cards.append(job_card)

    quotation.status = QuotationStatus.converted
    db.commit()
    for job_card in job_cards:
        db.refresh(job_card)
    return job_cards


# ---------------------------------------------------------------------------
# Paper job card ("sheet")
# ---------------------------------------------------------------------------
PAYMENT_KEYS = ["first", "rate", "advance", "balance1", "ap_advance", "balance2",
                "dtp", "proof", "printing", "binding", "packing", "delivery"]


def _iso(value) -> str:
    return value.isoformat() if value else ""


def _default_sheet(job_card: JobCard) -> Dict[str, Any]:
    item = job_card.quotation_item
    quotation = item.quotation if item else None
    return {
        "party_name": job_card.customer.name if job_card.customer else "",
        "mobile": (job_card.customer.phone or "") if job_card.customer else "",
        "job_name": job_card.product.name if job_card.product else "",
        "size": "",
        "type_of_printing": [],
        "proof1_date": _iso(quotation.proof1_date) if quotation else "",
        "proof1_time": (quotation.proof1_time or "") if quotation else "",
        "proof2_date": _iso(quotation.proof2_date) if quotation else "",
        "proof2_time": (quotation.proof2_time or "") if quotation else "",
        "delivery_date": _iso(job_card.delivery_date or (quotation.delivery_date if quotation else None)),
        "delivery_time": (quotation.delivery_time or "") if quotation else "",
        "paper": [
            {"range": "", "kgs": "", "colour": "",
             "qty": str(item.quantity) if (item and idx == 0 and item.quantity) else "",
             "printing": ""}
            for idx in range(4)
        ],
        "cutting_size": "",
        "printing_colours": [],
        "margins": [],
        "serial_from_to": "",
        "book_from_to": "",
        "payment": {key: "" for key in PAYMENT_KEYS},
        "remarks": job_card.notes or "",
        "job_position": [],
    }


def get_job_card_sheet(db: Session, job_card: JobCard) -> Dict[str, Any]:
    """Saved sheet content layered over defaults pulled from the order,
    plus the read-only header (invoice number / date / time, DC number)."""
    item = job_card.quotation_item
    quotation = item.quotation if item else None
    invoice = db.query(Invoice).filter(Invoice.quotation_id == quotation.id).first() if quotation else None
    challan = db.query(DeliveryChallan).filter(DeliveryChallan.job_card_id == job_card.id).first()

    # the form is pre-filled from the order and the job's progress; whatever staff saved on it wins
    sheet = merge_saved(prefilled_sheet(db, job_card), job_card.sheet_data)

    extras = sheet_extras(db, job_card)
    saved_lines = (job_card.sheet_data or {}).get("price_lines")
    if isinstance(saved_lines, list):
        extras["price_lines"] = saved_lines  # edited by hand on the job card
    return {
        "job_card_id": job_card.id,
        "job_number": job_card.job_number,
        "invoice_number": invoice.invoice_number if invoice else None,
        "invoice_date": invoice.invoice_date if invoice else None,
        "invoice_time": utc_naive_to_ist(invoice.created_at).strftime("%I:%M %p") if invoice and invoice.created_at else None,
        "dc_number": challan.dc_number if challan else None,
        "sheet": sheet,
        "price_edited": isinstance(saved_lines, list),
        **extras,
    }


def _clean_price_lines(lines: Any) -> List[Dict[str, Any]]:
    """The price list as typed on the job card: label, how it is worked out, amount (blank rows dropped)."""
    if not isinstance(lines, list):
        raise HTTPException(status_code=400, detail="The price list must be a list of lines")
    if len(lines) > 40:
        raise HTTPException(status_code=400, detail="A job card can carry at most 40 price lines")
    cleaned = []
    for row in lines:
        if not isinstance(row, dict):
            continue
        label = str(row.get("label") or "").strip()[:120]
        detail = str(row.get("detail") or "").strip()[:200]
        try:
            amount = round(float(row.get("amount") or 0), 2)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail=f"The amount of '{label or 'a price line'}' is not a number")
        if amount != amount or abs(amount) > 1_000_000_000:
            raise HTTPException(status_code=400, detail=f"The amount of '{label or 'a price line'}' is not valid")
        if not label and not amount:
            continue
        cleaned.append({"label": label or "Item", "detail": detail, "amount": amount})
    return cleaned


def apply_saved_price_lines(job_card: JobCard, detail: Dict[str, Any]) -> None:
    """Printing the detail job card: if the price list was edited on the paper job card, print those lines."""
    lines = (job_card.sheet_data or {}).get("price_lines")
    if isinstance(lines, list) and detail.get("price"):
        detail["price"]["breakdown"] = [{"label": l["label"], "detail": l.get("detail", ""), "amount": l["amount"], "kind": "custom"} for l in lines]


def _only_changes(base: Dict[str, Any], sheet: Dict[str, Any]) -> Dict[str, Any]:
    """Keeps just what staff changed. Cells left as the order filled them keep following the order
    (price, payments received, proof dates, status ticks ...) instead of being frozen at the moment of saving."""
    kept: Dict[str, Any] = {}
    for key, value in sheet.items():
        if key == "paper" and isinstance(value, list):
            rows = []
            for index, row in enumerate(value):
                ref = base["paper"][index] if index < len(base["paper"]) else {}
                rows.append({c: v for c, v in (row or {}).items() if str(v or "") != str(ref.get(c) or "")})
            if any(rows):
                kept["paper"] = rows
        elif key == "payment" and isinstance(value, dict):
            changed = {c: v for c, v in value.items() if str(v or "") != str(base["payment"].get(c) or "")}
            if changed:
                kept["payment"] = changed
        elif key == "job_position" and isinstance(value, list):
            extra = [v for v in value if v not in base["job_position"]]
            if extra:
                kept[key] = extra
        elif value != base.get(key):
            kept[key] = value
    return kept


def _proof_days_of_sheet(sheet: Dict[str, Any]) -> List[date]:
    days: List[date] = []
    values = [sheet.get("proof1_date"), sheet.get("proof2_date")] + [(p or {}).get("date") for p in (sheet.get("more_proofs") or [])]
    for raw in values:
        if raw:
            try:
                days.append(date.fromisoformat(str(raw)))
            except ValueError:
                continue
    return days


def save_job_card_sheet(db: Session, job_card: JobCard, sheet: Dict[str, Any]) -> Dict[str, Any]:
    sheet = dict(sheet)
    raw_delivery = sheet.get("delivery_date")
    if raw_delivery:
        try:
            delivery = date.fromisoformat(str(raw_delivery))
        except ValueError:
            raise HTTPException(status_code=400, detail="The delivery date is not a valid date")
        proof_days = _proof_days_of_sheet(sheet)
        if proof_days and delivery < max(proof_days):
            raise HTTPException(
                status_code=400,
                detail=f"The delivery date ({delivery:%d-%m-%Y}) cannot be before the last proof date ({max(proof_days):%d-%m-%Y})",
            )
    sent_price_lines = "price_lines" in sheet
    typed_lines = sheet.pop("price_lines", None)
    kept = _only_changes(prefilled_sheet(db, job_card), sheet)
    if not sent_price_lines:
        # the price list is not part of what was sent: whatever was saved before stays
        previous = (job_card.sheet_data or {}).get("price_lines")
        if isinstance(previous, list):
            kept["price_lines"] = previous
    elif typed_lines is not None:
        cleaned = _clean_price_lines(typed_lines)
        from_order = [{"label": l["label"], "detail": l.get("detail", ""), "amount": round(float(l["amount"]), 2)} for l in sheet_extras(db, job_card)["price_lines"]]
        if cleaned != from_order:  # only a real change is kept; otherwise the list keeps following the order
            kept["price_lines"] = cleaned
    # price_lines sent as null: back to the order's own price list
    job_card.sheet_data = kept
    # Keep the list-page "Delivery" column in step with the delivery date on the sheet.
    raw_delivery = sheet.get("delivery_date")
    if raw_delivery:
        try:
            job_card.delivery_date = date.fromisoformat(str(raw_delivery))
        except ValueError:
            pass
    db.commit()
    db.refresh(job_card)
    return get_job_card_sheet(db, job_card)


def reset_job_card_sheet(db: Session, job_card: JobCard) -> Dict[str, Any]:
    """Throws away what was typed on the form, so it is filled from the order again."""
    job_card.sheet_data = None
    db.commit()
    db.refresh(job_card)
    return get_job_card_sheet(db, job_card)
