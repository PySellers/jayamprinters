from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.pricing_engine import calculate_quote, PricingError
from app.schemas import QuoteRequest, QuoteResponse

router = APIRouter(prefix="/quotes", tags=["quotes"])


@router.post("/calculate", response_model=QuoteResponse)
def calculate(request: QuoteRequest, db: Session = Depends(get_db)):
    try:
        result = calculate_quote(
            db,
            category_code=request.category_code,
            quantity=request.quantity,
            selected_options=request.selected_options,
            extra_codes=request.extra_codes,
        )
    except PricingError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return result
