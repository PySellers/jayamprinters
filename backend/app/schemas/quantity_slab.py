from pydantic import BaseModel, Field, model_validator
from typing import Optional


class QuantitySlabCreate(BaseModel):
    category_id: int
    min_quantity: int = Field(gt=0)
    max_quantity: Optional[int] = None
    label: Optional[str] = None
    display_order: int = 0

    @model_validator(mode="after")
    def check_range(self):
        if self.max_quantity is not None and self.max_quantity < self.min_quantity:
            raise ValueError("max_quantity must be greater than or equal to min_quantity")
        return self


class QuantitySlabUpdate(BaseModel):
    category_id: Optional[int] = None
    min_quantity: Optional[int] = None
    max_quantity: Optional[int] = None
    label: Optional[str] = None
    display_order: Optional[int] = None


class QuantitySlabOut(QuantitySlabCreate):
    id: int

    class Config:
        from_attributes = True
