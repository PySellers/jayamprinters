from pydantic import BaseModel
from typing import Optional


class SimpleMasterCreate(BaseModel):
    name: str
    is_active: bool = True


class SimpleMasterUpdate(BaseModel):
    name: Optional[str] = None
    is_active: Optional[bool] = None


class SimpleMasterOut(SimpleMasterCreate):
    id: int

    class Config:
        from_attributes = True


class PrintingTypeCreate(SimpleMasterCreate):
    pass


class PrintingTypeUpdate(SimpleMasterUpdate):
    pass


class PrintingTypeOut(SimpleMasterOut):
    pass


class MachineCreate(SimpleMasterCreate):
    pass


class MachineUpdate(SimpleMasterUpdate):
    pass


class MachineOut(SimpleMasterOut):
    pass


class TaxCreate(BaseModel):
    name: str
    rate_percent: float
    is_default: bool = False
    is_active: bool = True


class TaxUpdate(BaseModel):
    name: Optional[str] = None
    rate_percent: Optional[float] = None
    is_default: Optional[bool] = None
    is_active: Optional[bool] = None


class TaxOut(TaxCreate):
    id: int

    class Config:
        from_attributes = True
