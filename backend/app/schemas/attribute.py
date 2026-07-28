from pydantic import BaseModel
from typing import Optional


class AttributeOptionCreate(BaseModel):
    value: str
    extra_price: float = 0.0
    display_order: int = 0
    is_active: bool = True


class AttributeOptionUpdate(BaseModel):
    value: Optional[str] = None
    extra_price: Optional[float] = None
    display_order: Optional[int] = None
    is_active: Optional[bool] = None


class AttributeOptionOut(AttributeOptionCreate):
    id: int
    attribute_id: int

    class Config:
        from_attributes = True


class AttributeCreate(BaseModel):
    category_id: int
    name: str
    is_required: bool = False
    display_order: int = 0
    is_active: bool = True


class AttributeUpdate(BaseModel):
    category_id: Optional[int] = None
    name: Optional[str] = None
    is_required: Optional[bool] = None
    display_order: Optional[int] = None
    is_active: Optional[bool] = None


class AttributeOut(AttributeCreate):
    id: int
    options: list[AttributeOptionOut] = []

    class Config:
        from_attributes = True
