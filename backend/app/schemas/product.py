from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from app.models.product import ProductPricingType


class ProductCategoryCreate(BaseModel):
    name: str
    is_active: bool = True
    guided_flow: Optional[str] = None
    min_charge: Optional[float] = None
    hsn_id: Optional[int] = None
    print_charge_mode: Optional[str] = None  # 'block' | 'per_copy' | None
    print_block_size: Optional[int] = None
    print_block_rate: Optional[float] = None
    print_per_copy_rate: Optional[float] = None
    print_per_layer: bool = False


class ProductCategoryUpdate(BaseModel):
    name: Optional[str] = None
    is_active: Optional[bool] = None
    guided_flow: Optional[str] = None
    min_charge: Optional[float] = None
    hsn_id: Optional[int] = None
    print_charge_mode: Optional[str] = None  # 'block' | 'per_copy' | None
    print_block_size: Optional[int] = None
    print_block_rate: Optional[float] = None
    print_per_copy_rate: Optional[float] = None
    print_per_layer: Optional[bool] = None


class ProductCategoryOut(ProductCategoryCreate):
    id: int

    class Config:
        from_attributes = True


class ProductCreate(BaseModel):
    name: str
    category_id: Optional[int] = None
    description: Optional[str] = None
    pricing_type: ProductPricingType = ProductPricingType.matrix
    fixed_price: Optional[float] = None
    hsn_id: Optional[int] = None
    is_active: bool = True


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    category_id: Optional[int] = None
    description: Optional[str] = None
    pricing_type: Optional[ProductPricingType] = None
    fixed_price: Optional[float] = None
    hsn_id: Optional[int] = None
    is_active: Optional[bool] = None


class ProductOut(ProductCreate):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True
