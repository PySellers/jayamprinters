"""
Tests exercising both pricing modes against an in-memory SQLite DB, so the
resolver logic in app/pricing_engine.py can be validated before real rate-card
numbers are entered.
"""
from decimal import Decimal

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.pricing_engine import calculate_quote, PricingError
from app.seed_data import seed


@pytest.fixture()
def db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    seed(session)
    yield session
    session.close()


def test_visiting_card_matrix_pricing(db):
    result = calculate_quote(
        db, category_code="VISITING_CARD", quantity=750,
        selected_options={"LAMINATION": "MATT"}, extra_codes=["CORNER_CUT"],
    )
    assert result["slab_label"] == "501-1000"
    assert result["base_rate_per_unit"] == Decimal("1.80")
    assert result["subtotal"] == Decimal("1.80") * 750
    assert result["extras_total"] == Decimal("30")
    assert result["total"] == result["subtotal"] + result["extras_total"]


def test_visiting_card_additional_block_slab(db):
    result = calculate_quote(db, category_code="VISITING_CARD", quantity=2500)
    assert result["slab_label"] == "Additional per 1000"
    assert result["base_rate_per_unit"] == Decimal("1.50")


def test_extra_charge_minimum_applies(db):
    # 50 units x 0.50/unit = 25, but FOILING has a minimum of 50
    result = calculate_quote(
        db, category_code="VISITING_CARD", quantity=50, extra_codes=["FOILING"],
    )
    assert result["extras_total"] == Decimal("50")


def test_sku_pricing_uses_real_rate_card_values(db):
    result = calculate_quote(
        db, category_code="RUBBER_STAMP_POLYMER", quantity=10,
        selected_options={"SKU": "C13_54X54"},
    )
    assert result["base_rate_per_unit"] == Decimal("180")
    assert result["total"] == Decimal("1800")


def test_unknown_category_raises(db):
    with pytest.raises(PricingError):
        calculate_quote(db, category_code="DOES_NOT_EXIST", quantity=1)


def test_quantity_outside_any_slab_raises(db):
    with pytest.raises(PricingError):
        calculate_quote(db, category_code="WEDDING_INVITATION_OFFSET", quantity=1,
                         selected_options={"SIZE": "6x4", "PAPER": "Art Board 250GSM"})
