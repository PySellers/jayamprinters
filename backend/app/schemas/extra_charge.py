from pydantic import BaseModel
from typing import Optional
from app.models.extra_charge import ChargeType


class ExtraChargeCreate(BaseModel):
    category_id: Optional[int] = None
    name: str
    charge_type: ChargeType
    amount: float
    is_active: bool = True
    group_name: Optional[str] = None
    requires_option_id: Optional[int] = None


class ExtraChargeUpdate(BaseModel):
    category_id: Optional[int] = None
    name: Optional[str] = None
    charge_type: Optional[ChargeType] = None
    amount: Optional[float] = None
    is_active: Optional[bool] = None
    group_name: Optional[str] = None
    requires_option_id: Optional[int] = None


class ExtraChargeOut(ExtraChargeCreate):
    id: int

    class Config:
        from_attributes = True
