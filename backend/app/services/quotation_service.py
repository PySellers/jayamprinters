from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from app.models.product import Product
from app.models.quotation import Quotation, QuotationItem, QuotationStatus, QuotationItemAttributeOption, QuotationItemExtraCharge
from app.schemas.quotation import QuotationCreate
from app.services import pricing_service

def generate_quotation_number(db: Session) -> str:
    count = db.query(Quotation).count() + 1
    return f"QT-{count:05d}"

def create_quotation(db: Session, payload: QuotationCreate) -> Quotation:
    quotation = Quotation(
        quotation_number=generate_quotation_number(db),
        customer_id=payload.customer_id,
        order_type=payload.order_type,
        notes=payload.notes,
        delivery_date=payload.delivery_date,
        delivery_time=payload.delivery_time,
        status=QuotationStatus.draft,
    )
    db.add(quotation)
    db.flush()

    subtotal = 0.0
    for item in payload.items:
        product = db.query(Product).filter(Product.id == item.product_id).first()
        if not product:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Product {item.product_id} not found")

        selected_options = [(so.attribute_id, so.attribute_option_id) for so in item.selected_options]
        unit_price, computed_charges = pricing_service.calculate_unit_price(
            db, product, item.quantity, selected_options, item.area_sqft, item.extra_charge_ids
        )

        db_item = QuotationItem(
            quotation_id=quotation.id,
            product_id=item.product_id,
            quantity=item.quantity,
            area_sqft=item.area_sqft,
            unit_price=unit_price,
            total_price=unit_price * item.quantity,
            spec_notes=item.spec_notes,
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

    tax = pricing_service.resolve_tax(db, payload.tax_id)
    tax_amount = round(subtotal * tax.rate_percent / 100, 2)
    quotation.tax_id = tax.id
    quotation.total_amount = subtotal
    quotation.tax_amount = tax_amount
    quotation.grand_total = round(subtotal + tax_amount, 2)

    db.commit()
    db.refresh(quotation)
    return quotation
