"""Fills the paper job card (the printed-form look-alike on the Job Card page) from the order, so nobody starts from a
blank form: party, job name, size, type of printing, paper range / GSM / colour / quantity for EVERY copy, cutting size,
ink colour, proof dates, remarks, the payment column and the 'Job Position' ticks that follow the live status.

Anything the staff type into the form and save is kept: a saved value wins over the order's value (blank cells fall
back to the order again), except the Job Position ticks which are always topped up with the live progress."""
import re
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.models.invoice import Invoice
from app.models.job_card import JobCard
from app.services.job_card_detail_service import job_card_detail

PAYMENT_KEYS = ["first", "rate", "advance", "balance1", "ap_advance", "balance2",
                "dtp", "proof", "printing", "binding", "packing", "delivery"]
OFFSET_SERVICES = {
    "Bill Books & Stationery", "Register", "Transfer Certificate", "Application Form", "Menu Card", "Book Covers",
    "Visiting Card", "Invitation & Greeting Cards", "Thamboola Bag", "ID Card",
}
SIZE_ATTRIBUTES = ("Paper Size", "Size", "Cover Size", "ID Size Type", "A3 Type")
PAPER_ATTRIBUTES = ("Paper Name", "Paper/GSM Type", "Paper/Board Type", "Board / Paper", "Colour / Paper Type", "Media Type", "Sticker Type", "Binding Material")
SIDE_ATTRIBUTES = ("Print Side", "Side")


def _money(value: Optional[float]) -> str:
    if value is None:
        return ""
    return f"{value:,.2f}" if abs(value - round(value)) > 0.004 else f"{round(value):,}"


def _first(specs: Dict[str, str], names) -> str:
    for name in names:
        if specs.get(name):
            return specs[name]
    return ""


def _type_of_printing(service: str, specs: Dict[str, str]) -> List[str]:
    colour = (specs.get("Colour") or specs.get("Colour / Paper Type") or "").lower()
    if service == "Xerox / Photocopy":
        return ["Xerox"]
    if service == "Printout":
        return ["Colour Printout"] if ("colour" in colour and "black" not in colour) or "photo" in colour else ["B/W Printout"]
    if service in OFFSET_SERVICES:
        return ["Offset", "Multi Colour"] if ("colour" in colour and "black" not in colour) else ["Offset"]
    if service in ("Digital Banner", "Stickers", "Board & Paper Printing (13x19)"):
        return ["Multi Colour"]
    return []


INK_OPTIONS = ["Royal Blue", "Peacock Blue", "Green", "Red", "Mejentha", "Merun", "Brown", "Black"]


def _ink_colours(notes_text: str, ink_attribute: str) -> List[str]:
    """The printing colour(s) named in the order ("Printing colour: Black") that match a box on the form."""
    found = re.search(r"printing colou?r\s*:\s*([^|;\n]+)", notes_text, re.I)
    text = (found.group(1) if found else "") or ("Black" if "black" in ink_attribute.lower() else "")
    return [o for o in INK_OPTIONS if o.lower() in text.lower()]


def _payment_rows(detail: Dict[str, Any], invoice: Optional[Invoice]) -> Dict[str, str]:
    """Rate / advance / balance from the bill, and the price split by stage from the price breakdown."""
    rows = {key: "" for key in PAYMENT_KEYS}
    price = detail.get("price")
    if price:
        rows["first"] = f"Bill total {_money(invoice.grand_total)}" if invoice is not None and invoice.grand_total else f"Total {_money(price['amount'])}"
        rows["rate"] = _money(price["rate"])
        buckets = {"dtp": 0.0, "proof": 0.0, "printing": 0.0, "binding": 0.0, "packing": 0.0, "delivery": 0.0}
        for part in price.get("breakdown") or []:
            amount = float(part.get("amount") or 0)
            text = f"{part.get('label', '')} {part.get('detail', '')}".lower()
            kind = part.get("kind")
            if kind == "printing":
                buckets["printing"] += amount
            elif any(w in text for w in ("design", "dtp", "logo", "typeset")):
                buckets["dtp"] += amount
            elif "proof" in text:
                buckets["proof"] += amount
            elif any(w in text for w in ("pack", "carton")):
                buckets["packing"] += amount
            elif any(w in text for w in ("deliver", "courier", "transport")):
                buckets["delivery"] += amount
            elif any(w in text for w in ("bind", "number", "perfor", "lamin", "cutting", "corner", "foil", "pad", "pin", "fold", "crease", "hemming")):
                buckets["binding"] += amount
        for key, amount in buckets.items():
            if amount > 0:
                rows[key] = _money(amount)
    if invoice is not None:
        rows["advance"] = _money(invoice.amount_paid) if (invoice.amount_paid or 0) > 0 else ""
        balance = (invoice.grand_total or 0) - (invoice.amount_paid or 0)
        rows["balance1"] = _money(max(balance, 0)) if invoice.grand_total else ""
    return rows


def _position_ticks(detail: Dict[str, Any], invoice: Optional[Invoice]) -> List[str]:
    ticks: List[str] = []
    proofs = detail.get("proofs") or []
    for p in proofs:
        if p["number"] == 1 and p["status"] in ("sent", "approved", "changes"):
            ticks.append("1st Proof")
        if p["number"] == 2 and p["status"] in ("sent", "approved", "changes"):
            ticks.append("2nd Proof")
    if proofs and all(p["status"] == "approved" for p in proofs):
        ticks.append("Proof OK")
    steps = detail.get("steps") or []
    # the step rows are matched by their names (the stage is not part of the detail)
    names_done = {s["name"].lower(): s["status"] in ("done", "skipped") for s in steps}
    if any(done and ("print" in name or "xerox" in name) for name, done in names_done.items()):
        ticks.append("Printing")
    if any(done and any(w in name for w in ("bind", "finish", "lamin", "cutting", "hemming")) for name, done in names_done.items()):
        ticks.append("Binding")
    status = detail.get("status")
    if status in ("packing", "delivered"):
        ticks.append("Ready")
    if status == "delivered":
        ticks.append("Delivery")
    if invoice is not None and invoice.grand_total:
        paid = invoice.amount_paid or 0
        if paid >= invoice.grand_total - 0.01:
            ticks.append("Full Payment")
        elif paid > 0:
            ticks.append("Half Payment")
    return ticks


def prefilled_sheet(db: Session, job: JobCard) -> Dict[str, Any]:
    """The whole form, as the order and the job's progress say it should read right now."""
    detail = job_card_detail(db, job, with_price=True)
    item = job.quotation_item
    quotation = item.quotation if item is not None else None
    invoice = db.query(Invoice).filter(Invoice.quotation_id == quotation.id).first() if quotation is not None else None
    specs = {s["label"]: s["value"] for s in detail["specs"]}
    service = detail["job"].get("service") or ""
    item_name = detail["job"].get("item") or ""
    quantity = detail["job"].get("quantity")
    sets = detail["job"].get("sets")

    # ---- names and size ----
    doc_type = specs.get("Document Type", "")
    job_name = service
    if doc_type:
        job_name = f"{service} - {doc_type}" if service else doc_type
    elif item_name and item_name != service and not item_name.startswith("Sheet Printing"):
        job_name = f"{service} - {item_name}" if service else item_name
    size = _first(specs, SIZE_ATTRIBUTES)
    if not size and item_name.startswith("Sheet Printing - "):
        size = item_name.replace("Sheet Printing - ", "")
    if not size and item_name and item_name != service:
        size = item_name
    if detail["job"].get("area_sqft"):
        size = f"{size} ({detail['job']['area_sqft']:g} sq ft)".strip() if size else f"{detail['job']['area_sqft']:g} sq ft"

    side = _first(specs, SIDE_ATTRIBUTES)
    ink = specs.get("Colour", "")
    printing_text = " / ".join(x for x in (side, ink) if x)
    qty_text = f"{quantity:,}" if quantity else ""
    if sets and quantity and sets > 1 and sets != quantity:
        qty_text = f"{quantity:,} ({sets:,} sets)"

    # ---- paper table: one row per copy of the set (up to 4), otherwise one row for the paper used ----
    paper_rows: List[Dict[str, str]] = []
    copies = detail.get("copies") or []
    paper_colour = specs.get("Paper Colour", "")
    if copies:
        # the paper colour of each copy is written into the order's notes as "(Original: White, Duplicate: Pink)"
        notes_text = " ".join(detail.get("notes") or [])
        for copy in copies[:4]:
            found = re.search(rf"{re.escape(copy['name'])}\s*:\s*([A-Za-z][A-Za-z ]*?)\s*(?:,|\)|$)", notes_text)
            paper_rows.append({
                "range": copy["paper"], "kgs": copy["gsm"], "colour": copy["colour"] or (found.group(1) if found else "") or paper_colour,
                "qty": qty_text, "printing": printing_text,
            })
    else:
        paper_rows.append({
            "range": specs.get("Paper Name") or _first(specs, PAPER_ATTRIBUTES[1:]),
            "kgs": specs.get("Paper/GSM Type", "") if specs.get("Paper Name") else "",
            "colour": paper_colour, "qty": qty_text, "printing": printing_text,
        })
    while len(paper_rows) < 4:
        paper_rows.append({"range": "", "kgs": "", "colour": "", "qty": "", "printing": ""})

    # ---- proofs ----
    proofs = {p["number"]: p for p in detail.get("proofs") or []}

    def proof_date(n: int, key: str) -> str:
        p = proofs.get(n)
        return (p.get(key) or "") if p else ""

    # ---- remarks: the order's notes, the extras and a rush flag ----
    remarks: List[str] = []
    if detail["urgent"]:
        remarks.append("URGENT - handle this job first")
    remarks.extend(detail["notes"])
    if detail["extras"]:
        remarks.append("Extras: " + "; ".join(f"{e['group']}: {e['name']}" for e in detail["extras"]))

    serial = ""
    book = ""
    for e in detail["extras"]:
        text = f"{e['group']} {e['name']}".lower()
        if "number" in text:
            serial = e["name"]
        if "book" in text and ("pad" in text or "bind" in text or "number" in text):
            book = e["name"]

    return {
        "party_name": detail["customer"]["name"],
        "mobile": detail["customer"].get("phone") or "",
        "job_name": job_name,
        "size": size,
        "type_of_printing": _type_of_printing(service, specs),
        "proof1_date": str(proof_date(1, "due_date") or (quotation.proof1_date if quotation is not None and quotation.proof1_date else "")),
        "proof1_time": proof_date(1, "due_time") or ((quotation.proof1_time or "") if quotation is not None else ""),
        "proof2_date": str(proof_date(2, "due_date") or (quotation.proof2_date if quotation is not None and quotation.proof2_date else "")),
        "proof2_time": proof_date(2, "due_time") or ((quotation.proof2_time or "") if quotation is not None else ""),
        "delivery_date": str(job.delivery_date or (quotation.delivery_date if quotation is not None and quotation.delivery_date else "")),
        "delivery_time": (detail.get("delivery_time") or ""),
        "paper": paper_rows,
        "cutting_size": size,
        "printing_colours": _ink_colours(" ".join(detail.get("notes") or []), ink),
        "margins": [],
        "serial_from_to": serial,
        "book_from_to": book,
        "payment": _payment_rows(detail, invoice),
        "remarks": "\n".join(remarks),
        "job_position": _position_ticks(detail, invoice),
    }


def merge_saved(base: Dict[str, Any], saved: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """What staff saved wins; a blank saved cell falls back to the order's value. Job Position ticks are topped up."""
    result = dict(base)
    for key, value in (saved or {}).items():
        if key == "paper" and isinstance(value, list):
            rows = []
            for index, row in enumerate(base["paper"]):
                mine = value[index] if index < len(value) and isinstance(value[index], dict) else {}
                rows.append({cell: (str(mine.get(cell)) if mine.get(cell) not in (None, "") else row.get(cell, "")) for cell in ("range", "kgs", "colour", "qty", "printing")})
            result["paper"] = rows
        elif key == "payment" and isinstance(value, dict):
            result["payment"] = {k: (str(value.get(k)) if value.get(k) not in (None, "") else base["payment"].get(k, "")) for k in PAYMENT_KEYS}
        elif key == "job_position" and isinstance(value, list):
            result["job_position"] = list(dict.fromkeys(list(value) + base["job_position"]))
        elif isinstance(value, list):
            if value:
                result[key] = value
        elif value not in (None, ""):
            result[key] = value
    return result
