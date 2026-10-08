from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.schemas.quotation import (
    QuotationCreate, QuotationOut, QuotationStatusUpdate,
    QuotationPreviewRequest, QuotationPreviewOut, QuotationPreviewItemOut,
)
from app.schemas.job_card import JobCardOut
from app.models.customer import Customer
from app.models.product import Product
from app.models.quotation import Quotation
from app.services import pricing_service
from app.services.quotation_service import create_quotation
from app.services.job_card_service import convert_quotation_to_job_cards
from app.services.quotation_pdf_service import generate_quotation_pdf

router = APIRouter(prefix="/quotations")

@router.post("/", response_model=QuotationOut)
def create(payload: QuotationCreate, db: Session = Depends(get_db)):
    return create_quotation(db, payload)

@router.post("/preview", response_model=QuotationPreviewOut)
def preview(payload: QuotationPreviewRequest, db: Session = Depends(get_db)):
    """Computes line/grand totals without persisting anything -- lets the
    billing-counter screen show a live running total as staff add items,
    the same way a retail POS shows the amount before the sale is finalized."""
    subtotal = 0.0
    items_out: List[QuotationPreviewItemOut] = []
    for item in payload.items:
        product = db.query(Product).filter(Product.id == item.product_id).first()
        if not product:
            raise HTTPException(status_code=404, detail=f"Product {item.product_id} not found")
        selected_options = [(so.attribute_id, so.attribute_option_id) for so in item.selected_options]
        try:
            unit_price, _ = pricing_service.calculate_unit_price(
                db, product, item.quantity, selected_options, item.area_sqft, item.extra_charge_ids
            )
        except HTTPException:
            # Required attribute not picked yet, or no matrix cell for this
            # combination -- not an error at preview time, just not priceable yet.
            items_out.append(QuotationPreviewItemOut(unit_price=0, total_price=0, priceable=False))
            continue
        total_price = unit_price * item.quantity
        subtotal += total_price
        items_out.append(QuotationPreviewItemOut(unit_price=unit_price, total_price=total_price, priceable=True))

    tax = pricing_service.resolve_tax(db, payload.tax_id)
    tax_amount = round(subtotal * tax.rate_percent / 100, 2)
    return QuotationPreviewOut(
        items=items_out, subtotal=subtotal, tax_amount=tax_amount, grand_total=round(subtotal + tax_amount, 2)
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
        content=generate_quotation_pdf(q, customer, products_by_id),
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
    db.delete(q)
    db.commit()
    return {"detail": "Deleted"}