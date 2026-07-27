"""
Multi-item checkout: a customer's cart (several product lines) becomes ONE
Order plus one JobCard per line, using the exact same pricing resolver as
/quotes and /jobs. This is what backs both the counter "create a bill with
several items" flow and the online storefront's checkout button
(source="online").
"""
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Order, OrderSource, OrderStatus, JobCard, Party, ProductCategory, JobStage, UserRole
from app.pricing_engine import calculate_quote, PricingError
from app.schemas import OrderCreate, OrderOut, QuoteResponse, PaymentIn
from app.routers.jobs import _to_out, _next_job_number
from app.auth import require_role

router = APIRouter(prefix="/orders", tags=["orders"])


def _next_order_number(db: Session) -> str:
    count = db.query(Order).count()
    return f"ORD-{count + 1:05d}"


def _order_to_out(order: Order, db: Session) -> OrderOut:
    items = db.query(JobCard).filter(JobCard.order_id == order.id).order_by(JobCard.id).all()
    item_outs = [_to_out(j, db) for j in items]
    grand_total = sum((i.computed_total or 0 for i in item_outs), start=Decimal("0"))
    paid = Decimal(order.paid_amount or 0)
    from app.schemas import PartyOut
    party_out = PartyOut.model_validate(order.party) if order.party else None
    return OrderOut(
        order_number=order.order_number,
        source=order.source.value if hasattr(order.source, "value") else order.source,
        status=order.status.value if hasattr(order.status, "value") else order.status,
        party=party_out,
        created_at=order.created_at,
        items=item_outs,
        grand_total=grand_total,
        paid_amount=paid,
        balance_due=grand_total - paid,
    )


@router.get("", response_model=list[OrderOut])
def list_orders(db: Session = Depends(get_db)):
    orders = db.query(Order).order_by(Order.id.desc()).all()
    return [_order_to_out(o, db) for o in orders]


@router.get("/{order_number}", response_model=OrderOut)
def get_order(order_number: str, db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.order_number == order_number).first()
    if order is None:
        raise HTTPException(status_code=404, detail=f"Unknown order '{order_number}'")
    return _order_to_out(order, db)


@router.post("", response_model=OrderOut, status_code=201)
def create_order(payload: OrderCreate, db: Session = Depends(get_db)):
    if not payload.items:
        raise HTTPException(status_code=400, detail="An order needs at least one item.")

    try:
        source = OrderSource(payload.source)
    except ValueError:
        raise HTTPException(status_code=400, detail="source must be 'counter' or 'online'")

    party = None
    if payload.party_id is not None:
        party = db.query(Party).filter(Party.id == payload.party_id).first()
        if party is None:
            raise HTTPException(status_code=404, detail=f"Unknown party id {payload.party_id}")
    elif payload.party is not None:
        party = Party(**payload.party.model_dump())
        db.add(party)
        db.flush()

    order = Order(
        order_number=_next_order_number(db),
        party_id=party.id if party else None,
        source=source,
    )
    db.add(order)
    db.flush()

    for item in payload.items:
        category = db.query(ProductCategory).filter(ProductCategory.code == item.category_code).first()
        if category is None:
            db.rollback()
            raise HTTPException(status_code=404, detail=f"Unknown category '{item.category_code}'")
        try:
            quote = calculate_quote(
                db, category_code=item.category_code, quantity=item.quantity,
                selected_options=item.selected_options, extra_codes=item.extra_codes,
            )
        except PricingError as exc:
            db.rollback()
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        job = JobCard(
            job_number=_next_job_number(db),
            order_id=order.id,
            party_id=party.id if party else None,
            category_id=category.id,
            quantity=item.quantity,
            selected_options=item.selected_options,
            selected_extra_codes=item.extra_codes,
            computed_total=quote["total"],
            stage=JobStage.ORDER_TAKEN,
            order_taken_by=payload.order_taken_by,
        )
        db.add(job)
        db.flush()  # so _next_job_number sees an accurate count for the next item

    db.commit()
    db.refresh(order)
    return _order_to_out(order, db)


@router.post("/{order_number}/payment", response_model=OrderOut)
def record_payment(
    order_number: str, payload: PaymentIn, db: Session = Depends(get_db),
    user=Depends(require_role(UserRole.ADMIN, UserRole.ACCOUNTS, UserRole.COUNTER)),
):
    """Record a payment against an order -- clears the 'unpaid_balance'
    reminder once paid_amount reaches the grand total."""
    order = db.query(Order).filter(Order.order_number == order_number).first()
    if order is None:
        raise HTTPException(status_code=404, detail=f"Unknown order '{order_number}'")
    if payload.amount <= 0:
        raise HTTPException(status_code=400, detail="Payment amount must be positive.")
    order.paid_amount = Decimal(order.paid_amount or 0) + payload.amount
    db.commit()
    db.refresh(order)
    return _order_to_out(order, db)


@router.post("/{order_number}/cancel", response_model=OrderOut)
def cancel_order(
    order_number: str, db: Session = Depends(get_db),
    user=Depends(require_role(UserRole.ADMIN)),
):
    """Admin-only: cancel an order. Kept as a soft status flip (not a delete)
    so the job numbers/order numbers already handed to a customer stay valid
    for audit purposes -- a true hard delete is deliberately not exposed."""
    order = db.query(Order).filter(Order.order_number == order_number).first()
    if order is None:
        raise HTTPException(status_code=404, detail=f"Unknown order '{order_number}'")
    order.status = OrderStatus.CANCELLED
    db.commit()
    db.refresh(order)
    return _order_to_out(order, db)
