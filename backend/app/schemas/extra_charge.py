from pydantic import BaseModel
from typing import Optional
from app.models.extra_charge import ChargeType


class ExtraChargeCreate(BaseModel):
    category_id: Optional[int] = None
    name: str
    charge_type: ChargeType
    amount: float
    is_active: bool = True


class ExtraChargeUpdate(BaseModel):
    category_id: Optional[int] = None
    name: Optional[str] = None
    charge_type: Optional[ChargeType] = None
    amount: Optional[float] = None
    is_active: Optional[bool] = None


class ExtraChargeOut(ExtraChargeCreate):
    id: int

    class Config:
        from_attributes = True
