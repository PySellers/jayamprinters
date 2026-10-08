from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy.orm import Session
from typing import List, Optional

from app.core.database import get_db
from app.core.security import require_role, get_current_user
from app.models.invoice import Invoice, InvoiceStatus
from app.models.customer import Customer
from app.models.product import Product
from app.models.user import User, UserRole
from app.schemas.invoice import InvoiceOut, InvoiceStatusUpdate, PaymentCreate
from app.services.invoice_service import create_invoice_from_quotation, record_payment, delete_payment, set_invoice_status
from app.services.pdf_service import generate_invoice_pdf, generate_invoice_thermal_pdf, THERMAL_WIDTHS_MM
from app.services.bill_pdf_service import generate_gst_bill_pdf, generate_cash_bill_pdf

admin_only = [Depends(require_role(UserRole.admin))]
router = APIRouter(tags=["billing"])
invoice_router = APIRouter(prefix="/invoices", tags=["billing"])
payment_router = APIRouter(prefix="/payments", tags=["billing"])


@invoice_router.post("/from-quotation/{quotation_id}", response_model=InvoiceOut, status_code=status.HTTP_201_CREATED)
def create_from_quotation(quotation_id: int, db: Session = Depends(get_db)):
    return create_invoice_from_quotation(db, quotation_id)


@invoice_router.get("/", response_model=List[InvoiceOut])
def get_invoices(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(Invoice).order_by(Invoice.id.desc()).offset(skip).limit(limit).all()


@invoice_router.get("/{invoice_id}", response_model=InvoiceOut)
def get_invoice(invoice_id: int, db: Session = Depends(get_db)):
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
    return invoice


@invoice_router.get("/{invoice_id}/pdf")
def download_invoice_pdf(
    invoice_id: int,
    format: str = Query("a4", description="a4 | thermal_58 | thermal_80 -- which printer layout to render"),
    db: Session = Depends(get_db),
):
    """Renders the invoice for whichever printer the counter is using:
    a full A4 page for a regular office/laser printer, or a narrow receipt
    for a small thermal bill-printing machine (58mm or 80mm roll). The PDF
    itself is sized to the target paper -- send it to the matching printer
    from the browser's normal print dialog, no special driver integration
    needed."""
    if format not in {"a4", *THERMAL_WIDTHS_MM}:
        raise HTTPException(status_code=400, detail=f"format must be one of: a4, {', '.join(THERMAL_WIDTHS_MM)}")

    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
    customer = db.query(Customer).filter(Customer.id == invoice.customer_id).first()
    if not customer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")

    product_ids = {item.product_id for item in invoice.items}
    products_by_id = {p.id: p for p in db.query(Product).filter(Product.id.in_(product_ids)).all()}

    if format == "a4":
        pdf_bytes = generate_invoice_pdf(invoice, customer, products_by_id)
        suffix = "a4"
    else:
        pdf_bytes = generate_invoice_thermal_pdf(invoice, customer, products_by_id, roll_width_mm=THERMAL_WIDTHS_MM[format])
        suffix = format

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{invoice.invoice_number}-{suffix}.pdf"'},
    )


@invoice_router.get("/{invoice_id}/bill-pdf")
def download_invoice_bill_pdf(
    invoice_id: int,
    bill_type: Optional[str] = Query(None, description="gst | cash -- defaults to the order's own setting: gst if the order was with GST, else cash"),
    db: Session = Depends(get_db),
):
    """The invoice drawn on Sri Jayam's own pre-printed bill layouts:
    `gst`  -> tax INVOICE (A4, CGST/SGST columns)
    `cash` -> CASH BILL (A5, Qty / Rate / Amount)."""
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
    customer = db.query(Customer).filter(Customer.id == invoice.customer_id).first()
    if not customer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")

    if bill_type is None:
        bill_type = "gst" if invoice.with_gst else "cash"
    if bill_type not in {"gst", "cash"}:
        raise HTTPException(status_code=400, detail="bill_type must be 'gst' or 'cash'")

    product_ids = {item.product_id for item in invoice.items}
    products_by_id = {p.id: p for p in db.query(Product).filter(Product.id.in_(product_ids)).all()}

    if bill_type == "gst":
        pdf_bytes = generate_gst_bill_pdf(invoice, customer, products_by_id)
        suffix = "gst-invoice"
    else:
        pdf_bytes = generate_cash_bill_pdf(invoice, customer, products_by_id)
        suffix = "cash-bill"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{invoice.invoice_number}-{suffix}.pdf"'},
    )


@invoice_router.put("/{invoice_id}/status", response_model=InvoiceOut)
def update_invoice_status(
    invoice_id: int,
    payload: InvoiceStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Status dropdown: `paid` records the remaining balance as a cash payment;
    `unpaid` clears all payments (same permission as deleting a payment)."""
    if payload.status == InvoiceStatus.unpaid and current_user.role not in (UserRole.admin, UserRole.accounts):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admin or accounts can move an invoice back to unpaid.",
        )
    return set_invoice_status(db, invoice_id, payload.status)


@invoice_router.post("/{invoice_id}/payments", response_model=InvoiceOut)
def add_payment(invoice_id: int, payload: PaymentCreate, db: Session = Depends(get_db)):
    return record_payment(db, invoice_id, payload)


@invoice_router.delete("/{invoice_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=admin_only)
def delete_invoice(invoice_id: int, db: Session = Depends(get_db)):
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
    db.delete(invoice)
    db.commit()
    return None


@payment_router.delete(
    "/{payment_id}", status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_role(UserRole.admin, UserRole.accounts))],
)
def remove_payment(payment_id: int, db: Session = Depends(get_db)):
    delete_payment(db, payment_id)
    return None


router.include_router(invoice_router)
router.include_router(payment_router)