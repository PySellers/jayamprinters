"""Reads a supplier's bill (photo or PDF) and turns it into a draft purchase, using the Claude API.

Needs ANTHROPIC_API_KEY in the environment (set on the Cloud Run service). Without it the purchase screen still works
by hand; the upload button just says the reader is not set up. Nothing is saved from here: the staff member checks the
draft lines and saves the purchase themselves.
"""

import base64
import difflib
import json
import re
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.purchase import InventoryItem, Vendor

MAX_BYTES = 8 * 1024 * 1024
IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
PDF_TYPE = "application/pdf"

PROMPT = """You are reading a supplier's purchase bill / invoice for a printing press in India.
Return ONLY a JSON object (no prose, no code fence) with exactly these keys:
{
  "vendor_name": string or null,          // the seller / company that issued the bill
  "vendor_gstin": string or null,         // the seller's GSTIN
  "bill_number": string or null,
  "bill_date": string or null,            // YYYY-MM-DD
  "lines": [ { "description": string, "quantity": number, "unit": string or null, "unit_price": number, "amount": number } ],
  "total_amount": number or null,         // grand total printed on the bill
  "notes": string or null                 // anything unusual (handwritten notes, tax lines, discounts)
}
Rules: one entry in "lines" per purchased item (not per tax line). unit_price is the rate per unit before tax.
If a number is unreadable use null for it; never guess. Amounts are in rupees."""


def _client():
    if not settings.ANTHROPIC_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Bill reading is not set up yet (the ANTHROPIC_API_KEY is missing). Enter the purchase by hand for now.",
        )
    try:
        import anthropic
    except ImportError:  # pragma: no cover - the package is in requirements.txt
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Bill reading is not installed on this server.")
    return anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)


def _content_block(data: bytes, content_type: str) -> Dict[str, Any]:
    encoded = base64.standard_b64encode(data).decode()
    if content_type == PDF_TYPE:
        return {"type": "document", "source": {"type": "base64", "media_type": PDF_TYPE, "data": encoded}}
    return {"type": "image", "source": {"type": "base64", "media_type": content_type, "data": encoded}}


def parse_reply(text: str) -> Dict[str, Any]:
    """The model's reply as a dict, tolerating a stray code fence or leading words."""
    cleaned = text.strip()
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", cleaned)
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("no JSON object in the reply")
    return json.loads(cleaned[start:end + 1])


def _number(value: Any) -> Optional[float]:
    try:
        return None if value is None else float(value)
    except (TypeError, ValueError):
        return None


def clean_bill(raw: Dict[str, Any]) -> Dict[str, Any]:
    """Keeps only usable lines and well-typed numbers."""
    lines: List[Dict[str, Any]] = []
    for line in raw.get("lines") or []:
        description = str(line.get("description") or "").strip()
        qty, price, amount = _number(line.get("quantity")), _number(line.get("unit_price")), _number(line.get("amount"))
        if not description:
            continue
        if price is None and qty and amount is not None:
            price = round(amount / qty, 4)
        if qty is None and price and amount is not None:
            qty = round(amount / price, 4)
        lines.append({"description": description, "quantity": qty or 1.0, "unit": (line.get("unit") or None), "unit_price": price or 0.0, "amount": amount})
    date_text = str(raw.get("bill_date") or "")
    return {
        "vendor_name": (raw.get("vendor_name") or None),
        "vendor_gstin": (raw.get("vendor_gstin") or None),
        "bill_number": (raw.get("bill_number") or None),
        "bill_date": date_text if re.fullmatch(r"\d{4}-\d{2}-\d{2}", date_text) else None,
        "lines": lines,
        "total_amount": _number(raw.get("total_amount")),
        "notes": (raw.get("notes") or None),
    }


def _norm(text: str) -> str:
    return re.sub(r"[^a-z0-9 ]", "", text.lower()).strip()


def best_match(text: str, names: Dict[int, str], cutoff: float) -> Optional[int]:
    wanted = _norm(text)
    if not wanted:
        return None
    best_id, best_score = None, 0.0
    for key, name in names.items():
        candidate = _norm(name)
        score = difflib.SequenceMatcher(None, wanted, candidate).ratio()
        if wanted in candidate or candidate in wanted:
            score = max(score, 0.85)
        if score > best_score:
            best_id, best_score = key, score
    return best_id if best_score >= cutoff else None


def attach_matches(db: Session, bill: Dict[str, Any]) -> Dict[str, Any]:
    """Suggests the vendor and the stock item for each line from what is already in the system."""
    vendors = db.query(Vendor).filter(Vendor.is_active.is_(True)).all()
    vendor_id = None
    gstin = (bill.get("vendor_gstin") or "").strip().upper()
    if gstin:
        vendor_id = next((v.id for v in vendors if (v.gstin or "").strip().upper() == gstin), None)
    if vendor_id is None and bill.get("vendor_name"):
        vendor_id = best_match(bill["vendor_name"], {v.id: v.name for v in vendors}, 0.75)
    items = {i.id: i.name for i in db.query(InventoryItem).all()}
    for line in bill["lines"]:
        line["inventory_item_id"] = best_match(line["description"], items, 0.6)
    bill["vendor_id"] = vendor_id
    return bill


def read_bill(data: bytes, content_type: str, filename: str = "") -> Dict[str, Any]:
    if content_type not in IMAGE_TYPES | {PDF_TYPE}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Upload a photo (JPG, PNG, WEBP) or a PDF of the bill.")
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="That file is too large - keep it under 8 MB.")
    client = _client()
    try:
        message = client.messages.create(
            model=settings.ANTHROPIC_MODEL,
            max_tokens=4000,
            messages=[{"role": "user", "content": [_content_block(data, content_type), {"type": "text", "text": PROMPT}]}],
        )
        text = "".join(block.text for block in message.content if getattr(block, "type", "") == "text")
        return clean_bill(parse_reply(text))
    except HTTPException:
        raise
    except ValueError:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="The bill could not be read clearly. Try a sharper photo, or enter it by hand.")
    except Exception as exc:  # network / quota / API errors
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"The bill reader is unavailable right now ({type(exc).__name__}). Enter it by hand.")
