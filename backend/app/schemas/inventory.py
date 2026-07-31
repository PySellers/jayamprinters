from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.models.inventory import StockMovementType


class InventoryItemCreate(BaseModel):
    name: str
    unit: str
    reorder_level: float = 0.0
    is_active: bool = True


class InventoryItemUpdate(BaseModel):
    name: Optional[str] = None
    unit: Optional[str] = None
    reorder_level: Optional[float] = None
    is_active: Optional[bool] = None


class InventoryItemOut(BaseModel):
    id: int
    name: str
    unit: str
    current_stock: float
    reorder_level: float
    is_active: bool

    class Config:
        from_attributes = True


class StockAdjustmentCreate(BaseModel):
    quantity: float = Field(description="Positive to add stock, negative to remove it")
    notes: Optional[str] = None


class StockMovementOut(BaseModel):
    id: int
    inventory_item_id: int
    movement_type: StockMovementType
    quantity: float
    reference: Optional[str]
    notes: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True
