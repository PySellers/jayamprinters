from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from app.services.numbering import next_number
from app.models.customer import Customer
from app.models.product import Product
from app.models.quotation import Quotation, QuotationItem, QuotationStatus, QuotationItemAttributeOption, QuotationItemExtraCharge
from app.schemas.quotation import QuotationCreate
from app.services import pricing_service

def generate_quotation_number(db: Session, is_order: bool = False) -> str:
    """QT-00001... for real quotations, OD-00001... for Start New Order orders,
    so the two series never mix on screen."""
    return next_number(db, Quotation.quotation_number, "OD" if is_order else "QT")

def create_quotation(db: Session, payload: QuotationCreate) -> Quotation:
    if not db.query(Customer.id).filter(Customer.id == payload.customer_id).first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")
    quotation = Quotation(
        quotation_number=generate_quotation_number(db, payload.is_order),
        customer_id=payload.customer_id,
        notes=payload.notes,
        with_gst=payload.with_gst,
        is_order=payload.is_order,
        proof1_date=payload.proof1_date,
        proof1_time=payload.proof1_time,
        proof2_date=payload.proof2_date,
        proof2_time=payload.proof2_time,
        delivery_date=payload.delivery_date,
        delivery_time=payload.delivery_time,
        estimated_delivery=(payload.estimated_delivery or None),
        status=QuotationStatus.draft,
    )
    db.add(quotation)
    db.flush()

    subtotal = 0.0
    tax_total = 0.0
    for item in payload.items:
        product = db.query(Product).filter(Product.id == item.product_id).first()
        if not product:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Product {item.product_id} not found")

        selected_options = [(so.attribute_id, so.attribute_option_id) for so in item.selected_options]
        line = pricing_service.price_line(
            db, product, item.quantity, selected_options, item.area_sqft, item.extra_charge_ids, item.sets,
            item.layer_gsm_option_ids, payload.tax_id,
        )
        computed_charges = line.charges
        line_total = round(line.total, 2)
        # GST is worked out per line from the item's HSN code; a cash bill carries no tax at all.
        line_tax_amount = round(line_total * line.tax_rate / 100, 2) if payload.with_gst else 0.0

        db_item = QuotationItem(
            quotation_id=quotation.id,
            product_id=item.product_id,
            quantity=item.quantity,
            area_sqft=item.area_sqft,
            unit_price=line.unit_price,
            total_price=line_total,
            spec_notes=item.spec_notes,
            sets=item.sets,
            layer_gsm_option_ids=item.layer_gsm_option_ids or None,
            print_charge=round(line.print_charge, 2),
            hsn_code=line.hsn_code,
            tax_rate=line.tax_rate if payload.with_gst else 0.0,
            tax_amount=line_tax_amount,
        )
        db.add(db_item)
        db.flush()

        for so in item.selected_options:
            db.add(QuotationItemAttributeOption(
                quotation_item_id=db_item.id,
                attribute_id=so.attribute_id,
                attribute_option_id=so.attribute_option_id,
            ))
        for extra_charge_id, computed_amount in computed_charges:
            db.add(QuotationItemExtraCharge(
                quotation_item_id=db_item.id,
                extra_charge_id=extra_charge_id,
                computed_amount=computed_amount,
            ))

        subtotal += db_item.total_price
        tax_total += line_tax_amount

    tax = pricing_service.resolve_tax(db, payload.tax_id)
    tax_amount = round(tax_total, 2)
    quotation.tax_id = tax.id
    subtotal = round(subtotal, 2)
    quotation.total_amount = subtotal
    quotation.tax_amount = tax_amount
    quotation.grand_total = round(subtotal + tax_amount, 2)

    db.commit()
    db.refresh(quotation)
    return quotation