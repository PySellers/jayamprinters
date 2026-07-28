from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime


class PriceMatrixCellOptionIn(BaseModel):
    attribute_id: int
    attribute_option_id: int


class PriceMatrixCellOptionOut(PriceMatrixCellOptionIn):
    id: int

    class Config:
        from_attributes = True


class PriceMatrixCellCreate(BaseModel):
    product_id: int
    quantity_slab_id: int
    unit_price: float
    is_active: bool = True
    options: List[PriceMatrixCellOptionIn] = []


class PriceMatrixCellUpdate(BaseModel):
    quantity_slab_id: Optional[int] = None
    unit_price: Optional[float] = None
    is_active: Optional[bool] = None
    options: Optional[List[PriceMatrixCellOptionIn]] = None


class PriceMatrixCellOut(BaseModel):
    id: int
    product_id: int
    quantity_slab_id: int
    unit_price: float
    is_active: bool
    created_at: datetime
    updated_at: datetime
    options: List[PriceMatrixCellOptionOut] = []

    class Config:
        from_attributes = True
