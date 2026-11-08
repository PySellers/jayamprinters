from typing import List, Optional, Tuple

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


def split_discount(
    line_totals: List[float],
    tax_rates: List[float],
    with_gst: bool,
    discount_type: Optional[str],
    discount_value: float,
) -> Tuple[float, List[float], List[float]]:
    """Order discount -> (total discount, discount per line, GST per line).

    The discount comes off the order total before GST and is spread over the lines by value, so the GST of every
    line is worked out on what the customer really pays for it."""
    gross = round(sum(line_totals), 2)
    value = float(discount_value or 0)
    if not discount_type or value <= 0 or gross <= 0:
        discount = 0.0
    elif discount_type == "percent":
        if value > 100:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A discount cannot be more than 100%")
        discount = round(gross * value / 100, 2)
    else:
        if value > gross:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"The discount (Rs.{value:,.2f}) is more than the order total (Rs.{gross:,.2f})",
            )
        discount = round(value, 2)

    per_line: List[float] = []
    running = 0.0
    for i, total in enumerate(line_totals):
        if discount <= 0:
            share = 0.0
        elif i == len(line_totals) - 1:
            share = round(discount - running, 2)
        else:
            share = round(discount * total / gross, 2)
        running += share
        per_line.append(share)
    taxes = [
        round((total - share) * rate / 100, 2) if with_gst else 0.0
        for total, share, rate in zip(line_totals, per_line, tax_rates)
    ]
    return discount, per_line, taxes


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
        priority=payload.priority,
        status=QuotationStatus.draft,
    )
    db.add(quotation)
    db.flush()

    # price every line first, so the order discount can be spread over them
    priced = []
    for item in payload.items:
        product = db.query(Product).filter(Product.id == item.product_id).first()
        if not product:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Product {item.product_id} not found")
        selected_options = [(so.attribute_id, so.attribute_option_id) for so in item.selected_options]
        layer_specs = [spec.model_dump() for spec in item.layer_specs]
        custom_charges = [c.model_dump() for c in item.custom_charges]
        line = pricing_service.price_line(
            db, product, item.quantity, selected_options, item.area_sqft, item.extra_charge_ids, item.sets,
            item.layer_gsm_option_ids, payload.tax_id, layer_specs or None, custom_charges or None,
        )
        priced.append((item, line, layer_specs, custom_charges))

    line_totals = [round(line.total, 2) for _, line, _, _ in priced]
    discount_total, line_discounts, line_taxes = split_discount(
        line_totals, [line.tax_rate for _, line, _, _ in priced], payload.with_gst, payload.discount_type, payload.discount_value,
    )

    for (item, line, layer_specs, custom_charges), line_total, line_discount, line_tax_amount in zip(priced, line_totals, line_discounts, line_taxes):
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
            layer_specs=layer_specs or None,
            custom_charges=custom_charges or None,
            price_breakdown=line.breakdown or None,
            print_charge=round(line.print_charge, 2),
            discount_amount=line_discount,
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
        for extra_charge_id, computed_amount in line.charges:
            db.add(QuotationItemExtraCharge(
                quotation_item_id=db_item.id,
                extra_charge_id=extra_charge_id,
                computed_amount=computed_amount,
            ))

    tax = pricing_service.resolve_tax(db, payload.tax_id)
    subtotal = round(sum(line_totals), 2)
    tax_amount = round(sum(line_taxes), 2)
    quotation.tax_id = tax.id
    quotation.total_amount = subtotal
    quotation.discount_type = payload.discount_type if discount_total > 0 else None
    quotation.discount_value = payload.discount_value if discount_total > 0 else 0.0
    quotation.discount_amount = discount_total
    quotation.tax_amount = tax_amount
    quotation.grand_total = round(subtotal - discount_total + tax_amount, 2)

    db.commit()
    db.refresh(quotation)
    return quotation
