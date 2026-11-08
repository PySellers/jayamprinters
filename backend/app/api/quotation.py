from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.schemas.quotation import (
    QuotationCreate, QuotationOut, QuotationStatusUpdate,
    QuotationPreviewRequest, QuotationPreviewOut, QuotationPreviewItemOut, TaxBreakdownRow,
)
from app.schemas.job_card import JobCardOut
from app.models.customer import Customer
from app.models.product import Product
from app.models.invoice import Invoice
from app.models.quotation import Quotation
from app.services import pricing_service
from app.services.quotation_service import create_quotation, split_discount
from app.services.job_card_service import convert_quotation_to_job_cards
from app.services.quotation_pdf_service import generate_quotation_pdf
from app.services.company_service import get_company

router = APIRouter(prefix="/quotations")

@router.post("/", response_model=QuotationOut)
def create(payload: QuotationCreate, db: Session = Depends(get_db)):
    return create_quotation(db, payload)

@router.post("/preview", response_model=QuotationPreviewOut)
def preview(payload: QuotationPreviewRequest, db: Session = Depends(get_db)):
    """Computes line/grand totals without persisting anything -- lets the
    billing-counter screen show a live running total as staff add items,
    the same way a retail POS shows the amount before the sale is finalized."""
    items_out: List[QuotationPreviewItemOut] = []
    priced = []  # (index into items_out, line)
    for item in payload.items:
        product = db.query(Product).filter(Product.id == item.product_id).first()
        if not product:
            raise HTTPException(status_code=404, detail=f"Product {item.product_id} not found")
        selected_options = [(so.attribute_id, so.attribute_option_id) for so in item.selected_options]
        try:
            line = pricing_service.price_line(
                db, product, item.quantity, selected_options, item.area_sqft, item.extra_charge_ids, item.sets,
                item.layer_gsm_option_ids, payload.tax_id,
                [spec.model_dump() for spec in item.layer_specs] or None,
                [c.model_dump() for c in item.custom_charges] or None,
            )
        except HTTPException as exc:
            # Required attribute not picked yet, or no matrix cell for this combination -- not an error at
            # preview time, just not priceable yet. A minimum-quantity problem is worth telling the counter about.
            message = exc.detail if isinstance(exc.detail, str) and "minimum order" in exc.detail else None
            items_out.append(QuotationPreviewItemOut(unit_price=0, total_price=0, priceable=False, message=message))
            continue
        priced.append((len(items_out), line))
        items_out.append(QuotationPreviewItemOut(
            unit_price=line.unit_price, total_price=round(line.total, 2), priceable=True,
            paper_total=round(line.paper_total, 2), print_charge=round(line.print_charge, 2),
            hsn_code=line.hsn_code, breakdown=line.breakdown,
        ))

    totals = [round(line.total, 2) for _, line in priced]
    discount, shares, taxes = split_discount(
        totals, [line.tax_rate for _, line in priced], payload.with_gst, payload.discount_type, payload.discount_value,
    )
    breakdown: dict = {}
    for (idx, line), total, share, tax in zip(priced, totals, shares, taxes):
        out = items_out[idx]
        out.discount_amount = share
        out.tax_rate = line.tax_rate if payload.with_gst else 0.0
        out.tax_amount = tax
        if payload.with_gst:
            row = breakdown.setdefault((line.hsn_code, line.tax_rate), {"taxable": 0.0, "tax": 0.0})
            row["taxable"] += total - share
            row["tax"] += tax

    subtotal = round(sum(totals), 2)
    tax_amount = round(sum(r["tax"] for r in breakdown.values()), 2)
    return QuotationPreviewOut(
        items=items_out, subtotal=subtotal, discount_amount=discount, taxable_amount=round(subtotal - discount, 2),
        tax_amount=tax_amount, grand_total=round(subtotal - discount + tax_amount, 2),
        tax_breakdown=[TaxBreakdownRow(hsn_code=k[0], rate=k[1], taxable=round(v["taxable"], 2), tax=round(v["tax"], 2)) for k, v in breakdown.items()],
    )

@router.get("/", response_model=List[QuotationOut])
def list_quotations(include_orders: bool = False, db: Session = Depends(get_db)):
    """Real quotations only. Orders made through Start New Order skip the quotation
    stage and live under Invoices, so they are left out unless asked for."""
    query = db.query(Quotation)
    if not include_orders:
        query = query.filter(Quotation.is_order.is_(False))
    return query.order_by(Quotation.id.desc()).all()

@router.get("/{quotation_id}", response_model=QuotationOut)
def get_quotation(quotation_id: int, db: Session = Depends(get_db)):
    q = db.query(Quotation).filter(Quotation.id == quotation_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Quotation not found")
    return q

@router.get("/{quotation_id}/pdf")
def quotation_pdf(quotation_id: int, db: Session = Depends(get_db)):
    """The quotation as a printable letter (Ref / Date / Particulars, Qty, Rate, Amount / Terms)."""
    q = db.query(Quotation).filter(Quotation.id == quotation_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Quotation not found")
    customer = db.query(Customer).filter(Customer.id == q.customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    product_ids = {item.product_id for item in q.items}
    products_by_id = {p.id: p for p in db.query(Product).filter(Product.id.in_(product_ids)).all()}
    return Response(
        content=generate_quotation_pdf(q, customer, products_by_id, get_company(db)),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{q.quotation_number}.pdf"'},
    )


@router.patch("/{quotation_id}/status", response_model=QuotationOut)
def update_status(quotation_id: int, payload: QuotationStatusUpdate, db: Session = Depends(get_db)):
    q = db.query(Quotation).filter(Quotation.id == quotation_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Quotation not found")
    q.status = payload.status
    db.commit()
    db.refresh(q)
    return q

@router.post("/{quotation_id}/convert", response_model=List[JobCardOut])
def convert_to_job_cards(quotation_id: int, db: Session = Depends(get_db)):
    return convert_quotation_to_job_cards(db, quotation_id)

@router.delete("/{quotation_id}")
def delete_quotation(quotation_id: int, db: Session = Depends(get_db)):
    q = db.query(Quotation).filter(Quotation.id == quotation_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Quotation not found")
    if db.query(Invoice.id).filter(Invoice.quotation_id == quotation_id).first():
        raise HTTPException(status_code=400, detail="This order already has an invoice. Delete the invoice first.")
    db.delete(q)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="This order already has job cards. Delete them first.")
    return {"detail": "Deleted"}