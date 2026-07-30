from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.quotation import Quotation, QuotationStatus
from app.models.invoice import Invoice, InvoiceItem, InvoiceItemAttributeOption, Payment, InvoiceStatus
from app.schemas.invoice import PaymentCreate


def generate_invoice_number(db: Session) -> str:
    count = db.query(Invoice).count() + 1
    return f"INV-{count:05d}"


def create_invoice_from_quotation(db: Session, quotation_id: int) -> Invoice:
    quotation = db.query(Quotation).filter(Quotation.id == quotation_id).first()
    if not quotation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quotation not found")
    if quotation.status != QuotationStatus.converted:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Quotation must be converted to job cards before invoicing",
        )
    existing = db.query(Invoice).filter(Invoice.quotation_id == quotation_id).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Quotation already invoiced")

    invoice = Invoice(
        invoice_number=generate_invoice_number(db),
        quotation_id=quotation.id,
        customer_id=quotation.customer_id,
        tax_id=quotation.tax_id,
        subtotal=quotation.total_amount,
        tax_amount=quotation.tax_amount,
        grand_total=quotation.grand_total,
        status=InvoiceStatus.unpaid,
    )
    db.add(invoice)
    db.flush()

    for item in quotation.items:
        invoice_item = InvoiceItem(
            invoice_id=invoice.id,
            product_id=item.product_id,
            quantity=item.quantity,
            area_sqft=item.area_sqft,
            unit_price=item.unit_price,
            total_price=item.total_price,
            spec_notes=item.spec_notes,
        )
        db.add(invoice_item)
        db.flush()
        for selected in item.selected_options:
            db.add(InvoiceItemAttributeOption(
                invoice_item_id=invoice_item.id,
                attribute_id=selected.attribute_id,
                attribute_option_id=selected.attribute_option_id,
            ))

    db.commit()
    db.refresh(invoice)
    return invoice


def _recompute_invoice_status(db: Session, invoice: Invoice) -> None:
    total_paid = sum(p.amount for p in invoice.payments)
    invoice.amount_paid = total_paid
    if total_paid <= 0:
        invoice.status = InvoiceStatus.unpaid
    elif total_paid >= invoice.grand_total:
        invoice.status = InvoiceStatus.paid
    else:
        invoice.status = InvoiceStatus.partially_paid
    db.commit()
    db.refresh(invoice)


def record_payment(db: Session, invoice_id: int, payload: PaymentCreate) -> Invoice:
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
    if payload.amount <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Payment amount must be positive")

    db.add(Payment(invoice_id=invoice.id, **payload.model_dump()))
    db.commit()
    db.refresh(invoice)
    _recompute_invoice_status(db, invoice)
    return invoice


def delete_payment(db: Session, payment_id: int) -> None:
    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    if not payment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found")
    invoice = payment.invoice
    db.delete(payment)
    db.commit()
    db.refresh(invoice)
    _recompute_invoice_status(db, invoice)
