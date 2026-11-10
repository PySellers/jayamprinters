"""A customer's earlier orders (for deciding on a discount) and the contact export for the Admin's phone / Google Contacts."""
import csv
import io
import re
from datetime import timedelta
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.models.customer import Customer
from app.models.invoice import Invoice
from app.models.product import Product
from app.models.user import User
from app.services.time_utils import today_ist

GROUP_LABEL = "Sri Jayam Printers"


def order_history(db: Session, customer_id: int, limit: int = 30) -> Dict[str, Any]:
    """One line per earlier order (newest first) plus a short summary; a frequent customer can be given a bigger discount."""
    invoices = db.query(Invoice).filter(Invoice.customer_id == customer_id).order_by(Invoice.invoice_date.desc(), Invoice.id.desc()).all()
    product_ids = {item.product_id for inv in invoices for item in inv.items}
    names = {p.id: p.name for p in db.query(Product).filter(Product.id.in_(product_ids)).all()} if product_ids else {}
    rows: List[Dict[str, Any]] = []
    for inv in invoices[:limit]:
        names_in = [names.get(i.product_id, f"Item {i.product_id}") for i in inv.items]
        shown = ", ".join(dict.fromkeys(names_in))
        qty = sum(i.quantity or 0 for i in inv.items)
        rows.append({
            "invoice_id": inv.id,
            "invoice_number": inv.invoice_number,
            "bill_no": inv.bill_no,
            "date": inv.invoice_date.isoformat() if inv.invoice_date else None,
            "name": shown,
            "quantity": qty,
            "lines": len(inv.items),
            "amount": round(inv.grand_total or 0.0, 2),
            "discount": round(inv.discount_amount or 0.0, 2),
            "paid": round(inv.amount_paid or 0.0, 2),
            "balance": round(max((inv.grand_total or 0.0) - (inv.amount_paid or 0.0), 0.0), 2),
            "status": inv.status.value if inv.status else None,
            "with_gst": bool(inv.with_gst),
        })
    today = today_ist()
    recent = [i for i in invoices if i.invoice_date and i.invoice_date >= today - timedelta(days=180)]
    total = round(sum(i.grand_total or 0.0 for i in invoices), 2)
    count = len(invoices)
    discounts = round(sum(i.discount_amount or 0.0 for i in invoices), 2)
    if count == 0:
        tag = "New customer - no earlier orders"
    elif count >= 10 or len(recent) >= 6:
        tag = "Very frequent customer"
    elif count >= 4 or len(recent) >= 3:
        tag = "Regular customer"
    else:
        tag = "Occasional customer"
    return {
        "customer_id": customer_id,
        "orders": count,
        "orders_last_180_days": len(recent),
        "total_billed": total,
        "average_order": round(total / count, 2) if count else 0.0,
        "discount_given": discounts,
        "balance_due": round(sum(max((i.grand_total or 0.0) - (i.amount_paid or 0.0), 0.0) for i in invoices), 2),
        "tag": tag,
        "rows": rows,
    }


# ---- contacts export ----------------------------------------------------------
def _intl(phone: Optional[str]) -> Optional[str]:
    """+91XXXXXXXXXX for a 10-digit Indian mobile; anything else is kept as typed (digits and a leading +)."""
    if not phone:
        return None
    digits = re.sub(r"\D", "", phone)
    if len(digits) == 10:
        return "+91" + digits
    if len(digits) == 12 and digits.startswith("91"):
        return "+" + digits
    if len(digits) == 11 and digits.startswith("0"):
        return "+91" + digits[1:]
    return ("+" if phone.strip().startswith("+") else "") + digits if digits else None


def _people(db: Session, include_staff: bool) -> List[Dict[str, Any]]:
    people: List[Dict[str, Any]] = []
    for c in db.query(Customer).order_by(Customer.id).all():
        name = (c.billing_person_name or c.name or "").strip()
        if c.name and c.billing_person_name and c.name.strip() != c.billing_person_name.strip():
            name = f"{c.billing_person_name.strip()} ({c.name.strip()})"
        phones = [p for p in (_intl(c.phone), _intl(c.whatsapp_number)) if p]
        phones = list(dict.fromkeys(phones))
        if not phones or not name:
            continue
        people.append({"name": name, "phones": phones, "email": c.email, "address": c.address, "note": "Customer", "org": ""})
    if include_staff:
        for u in db.query(User).filter(User.is_active.is_(True)).order_by(User.id).all():
            phone = _intl(u.phone)
            if phone:
                people.append({"name": u.name, "phones": [phone], "email": u.email, "address": None, "note": f"Staff - {u.role.value}", "org": GROUP_LABEL})
    return people


def _vcard_escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\r", "").replace("\n", "\\n")


def contacts_vcf(db: Session, include_staff: bool = True) -> str:
    """vCard 3.0 - opens in the phone's Contacts and imports into Google Contacts (contacts.google.com > Import)."""
    out: List[str] = []
    for p in _people(db, include_staff):
        out += ["BEGIN:VCARD", "VERSION:3.0", f"FN:{_vcard_escape(p['name'])}", f"N:{_vcard_escape(p['name'])};;;;"]
        for i, phone in enumerate(p["phones"]):
            out.append(f"TEL;TYPE={'CELL' if i == 0 else 'WORK'}:{phone}")
        if p["email"]:
            out.append(f"EMAIL;TYPE=INTERNET:{_vcard_escape(p['email'])}")
        if p["address"]:
            out.append(f"ADR;TYPE=WORK:;;{_vcard_escape(p['address'])};;;;")
        if p["org"]:
            out.append(f"ORG:{_vcard_escape(p['org'])}")
        out.append(f"NOTE:{_vcard_escape(GROUP_LABEL + ' - ' + p['note'])}")
        out.append(f"CATEGORIES:{GROUP_LABEL}")
        out.append("END:VCARD")
    return "\r\n".join(out) + "\r\n"


def contacts_csv(db: Session, include_staff: bool = True) -> str:
    """Google Contacts CSV format (Import > choose this file); everyone lands under the label 'Sri Jayam Printers'."""
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["Name", "Given Name", "Notes", "Group Membership", "E-mail 1 - Type", "E-mail 1 - Value",
                     "Phone 1 - Type", "Phone 1 - Value", "Phone 2 - Type", "Phone 2 - Value", "Address 1 - Formatted"])
    for p in _people(db, include_staff):
        phones = p["phones"] + ["", ""]
        writer.writerow([p["name"], p["name"], f"{GROUP_LABEL} - {p['note']}", f"{GROUP_LABEL} ::: * myContacts",
                         "Work" if p["email"] else "", p["email"] or "", "Mobile", phones[0], "Work" if phones[1] else "", phones[1],
                         (p["address"] or "").replace("\n", ", ")])
    return buf.getvalue()


def contact_count(db: Session, include_staff: bool = True) -> int:
    return len(_people(db, include_staff))
