"""Editing an invoice after it was made (customer details, date, rows, CGST / SGST, final amount).

Every figure is worked out here -- the edit window asks for a preview, the save uses the very same function -- so what
the counter sees, what is stored and what prints on the bill can never disagree. The GST logic is the one the order
already used: the invoice discount comes off before tax and is spread over the rows, tax is worked out on what remains.
"""
from datetime import datetime
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.company import CompanySettings
from app.models.customer import Customer
from app.models.invoice import Invoice, InvoiceItem, InvoiceStatus
from app.models.invoice_edit import InvoiceEdit
from app.models.product import Product
from app.schemas.invoice import InvoiceEditForm, InvoiceEditLine, InvoiceEditLineOut, InvoiceEditPreview, InvoiceEditRequest
from app.services.quotation_service import adjustment_for, split_discount


def bill_to(invoice: Invoice, customer: Customer) -> dict:
    """Who the bill is made out to: what was edited on this invoice, else the customer's own details."""
    return {
        "name": (invoice.bill_to_name or "").strip() or (customer.name if customer else "") or "",
        "address": (invoice.bill_to_address if invoice.bill_to_address is not None else (customer.address if customer else "")) or "",
        "gstin": (invoice.bill_to_gstin if invoice.bill_to_gstin is not None else (customer.gstin if customer else "")) or "",
        "phone": (invoice.bill_to_phone if invoice.bill_to_phone is not None else (customer.phone if customer else "")) or "",
    }


def default_particulars(db: Session, item: InvoiceItem) -> str:
    """The row's text as the bill prints it without any edit: item name with the chosen options, then its specification."""
    from app.services.bill_pdf_service import _item_text
    product = db.query(Product).filter(Product.id == item.product_id).first() if item.product_id else None
    description, notes = _item_text(product, item)
    return f"{description}\n{notes}" if notes else description


def _tax_split(item: InvoiceItem, invoice: Invoice, fallback_rate: float) -> tuple[float, float]:
    """(CGST %, SGST %) of a row: the edited values, else the row's tax rate split in two."""
    if item.cgst_rate is not None or item.sgst_rate is not None:
        return float(item.cgst_rate or 0.0), float(item.sgst_rate or 0.0)
    rate = float(item.tax_rate or 0.0)
    if not rate and not item.hsn_code and invoice.with_gst:
        rate = fallback_rate
    return rate / 2, rate / 2


def edit_form(db: Session, invoice: Invoice) -> InvoiceEditForm:
    customer = db.query(Customer).filter(Customer.id == invoice.customer_id).first()
    who = bill_to(invoice, customer)
    fallback = (invoice.tax.rate_percent if invoice.tax is not None and invoice.tax.rate_percent is not None
                else (invoice.tax_amount / invoice.subtotal * 100 if invoice.subtotal else 0.0))
    lines = []
    for item in invoice.items:
        cgst, sgst = _tax_split(item, invoice, float(fallback or 0.0))
        lines.append(InvoiceEditLine(
            id=item.id,
            particulars=item.particulars or default_particulars(db, item),
            hsn_code=item.hsn_code,
            quantity=item.quantity,
            unit_price=item.unit_price,
            cgst_rate=round(cgst, 4) if invoice.with_gst else 0.0,
            sgst_rate=round(sgst, 4) if invoice.with_gst else 0.0,
        ))
    history = [
        {"edited_at": e.edited_at.isoformat() if e.edited_at else None, "edited_by": e.edited_by, "summary": e.summary}
        for e in db.query(InvoiceEdit).filter(InvoiceEdit.invoice_id == invoice.id).order_by(InvoiceEdit.id.desc()).limit(10).all()
    ]
    return InvoiceEditForm(
        invoice_id=invoice.id, with_gst=bool(invoice.with_gst),
        bill_to_name=who["name"], bill_to_address=who["address"], bill_to_gstin=who["gstin"], bill_to_phone=who["phone"],
        invoice_date=invoice.invoice_date, notes=invoice.notes,
        final_amount=round(invoice.grand_total, 2) if abs(invoice.adjustment_amount or 0.0) > 0.004 else None,
        amount_paid=round(invoice.amount_paid or 0.0, 2), items=lines, history=history,
    )


def compute_edit(invoice: Invoice, payload: InvoiceEditRequest) -> InvoiceEditPreview:
    """The invoice's figures for the rows as edited (nothing is saved)."""
    existing = {item.id: item for item in invoice.items}
    for line in payload.items:
        if line.id is not None and line.id not in existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="One of the rows does not belong to this invoice")
    amounts = [round(line.quantity * line.unit_price, 2) for line in payload.items]
    with_gst = bool(invoice.with_gst)
    # one combined rate per row for the shared order-discount splitter; CGST / SGST are then worked out per half
    combined = [(line.cgst_rate + line.sgst_rate) if with_gst else 0.0 for line in payload.items]
    discount, shares, _ = split_discount(amounts, combined, with_gst, invoice.discount_type, invoice.discount_value or 0.0)

    lines, subtotal, tax_total = [], 0.0, 0.0
    for line, amount, share in zip(payload.items, amounts, shares):
        base = amount - share
        cgst = round(base * line.cgst_rate / 100, 2) if with_gst else 0.0
        sgst = round(base * line.sgst_rate / 100, 2) if with_gst else 0.0
        subtotal += amount
        tax_total += cgst + sgst
        lines.append(InvoiceEditLineOut(
            id=line.id, particulars=line.particulars.strip(), hsn_code=(line.hsn_code or "").strip() or None,
            quantity=line.quantity, unit_price=line.unit_price, amount=amount, discount_amount=share,
            cgst_rate=line.cgst_rate if with_gst else 0.0, sgst_rate=line.sgst_rate if with_gst else 0.0,
            cgst_amount=cgst, sgst_amount=sgst, total=round(base + cgst + sgst, 2),
        ))
    subtotal, tax_total = round(subtotal, 2), round(tax_total, 2)
    calculated = round(subtotal - discount + tax_total, 2)
    adjustment = adjustment_for(calculated, payload.final_amount)
    grand = round(calculated + adjustment, 2)
    paid = round(invoice.amount_paid or 0.0, 2)
    return InvoiceEditPreview(
        lines=lines, subtotal=subtotal, discount_amount=discount, taxable_amount=round(subtotal - discount, 2),
        tax_amount=tax_total, computed_total=calculated, adjustment_amount=adjustment, grand_total=grand,
        amount_paid=paid, balance=round(max(grand - paid, 0.0), 2),
    )


def _summary(invoice: Invoice, old: dict, new: InvoiceEditPreview, payload: InvoiceEditRequest, who_before: dict) -> str:
    parts = []
    if abs(old["grand_total"] - new.grand_total) > 0.004:
        parts.append(f"total Rs.{old['grand_total']:,.2f} -> Rs.{new.grand_total:,.2f}")
    if old["rows"] != len(payload.items):
        parts.append(f"rows {old['rows']} -> {len(payload.items)}")
    if old["date"] != (payload.invoice_date or old["date"]):
        parts.append("date changed")
    after = {"name": payload.bill_to_name, "address": payload.bill_to_address, "gstin": payload.bill_to_gstin, "phone": payload.bill_to_phone}
    if any((after[k] or "").strip() != (who_before[k] or "").strip() for k in after if after[k] is not None):
        parts.append("customer details changed")
    return "; ".join(parts) or "edited"


def apply_edit(db: Session, invoice_id: int, payload: InvoiceEditRequest, edited_by: Optional[str]) -> Invoice:
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
    preview = compute_edit(invoice, payload)
    paid = round(invoice.amount_paid or 0.0, 2)
    if preview.grand_total + 0.004 < paid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Rs.{paid:,.2f} is already received on this invoice, which is more than the new total (Rs.{preview.grand_total:,.2f}). "
                   "Delete the extra payment first, then edit the invoice.",
        )

    customer = db.query(Customer).filter(Customer.id == invoice.customer_id).first()
    who_before = bill_to(invoice, customer)
    old = {"grand_total": invoice.grand_total or 0.0, "rows": len(invoice.items), "date": invoice.invoice_date}

    # customer details: typed values are kept on this invoice only; a value equal to the customer's own is not stored
    own = {"name": customer.name if customer else "", "address": (customer.address if customer else "") or "",
           "gstin": (customer.gstin if customer else "") or "", "phone": (customer.phone if customer else "") or ""}
    for key, typed in (("name", payload.bill_to_name), ("address", payload.bill_to_address), ("gstin", payload.bill_to_gstin), ("phone", payload.bill_to_phone)):
        if typed is None:
            continue
        typed = typed.strip()
        if key == "name" and not typed:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="The customer name cannot be empty")
        setattr(invoice, f"bill_to_{key}", None if typed == own[key].strip() else typed)

    summary = _summary(invoice, old, preview, payload, who_before)
    if payload.invoice_date:
        invoice.invoice_date = payload.invoice_date
    if payload.notes is not None:
        invoice.notes = payload.notes.strip() or None

    by_id = {item.id: item for item in invoice.items}
    keep = {line.id for line in payload.items if line.id is not None}
    for item_id, item in list(by_id.items()):
        if item_id not in keep:
            invoice.items.remove(item)
    for line, calc in zip(payload.items, preview.lines):
        item = by_id.get(line.id) if line.id is not None else None
        if item is None:
            item = InvoiceItem(invoice_id=invoice.id, product_id=None, discount_amount=0.0)
            invoice.items.append(item)
        else:
            if item.quantity != line.quantity or abs((item.unit_price or 0.0) - line.unit_price) > 0.004:
                item.price_breakdown = None  # the breakdown no longer explains the new price
        default = default_particulars(db, item) if item.id else ""
        item.particulars = None if (item.id and line.particulars.strip() == default.strip()) else line.particulars.strip()
        item.hsn_code = calc.hsn_code
        item.quantity = line.quantity
        item.unit_price = line.unit_price
        item.total_price = calc.amount
        item.discount_amount = calc.discount_amount
        item.cgst_rate, item.sgst_rate = calc.cgst_rate, calc.sgst_rate
        item.cgst_amount, item.sgst_amount = calc.cgst_amount, calc.sgst_amount
        item.tax_rate = round(calc.cgst_rate + calc.sgst_rate, 4)
        item.tax_amount = round(calc.cgst_amount + calc.sgst_amount, 2)

    invoice.subtotal = preview.subtotal
    invoice.discount_amount = preview.discount_amount
    invoice.tax_amount = preview.tax_amount
    invoice.adjustment_amount = preview.adjustment_amount
    invoice.grand_total = preview.grand_total
    invoice.last_edited_at = datetime.utcnow()
    invoice.last_edited_by = edited_by
    db.add(InvoiceEdit(invoice_id=invoice.id, edited_by=edited_by, summary=summary[:250]))
    # payments are untouched; only the status follows the new total
    if paid <= 0:
        invoice.status = InvoiceStatus.unpaid
    elif paid >= round(invoice.grand_total, 2):
        invoice.status = InvoiceStatus.paid
    else:
        invoice.status = InvoiceStatus.partially_paid
    db.commit()
    db.refresh(invoice)
    return invoice
