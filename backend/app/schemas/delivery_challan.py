from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel

from app.models.delivery_challan import DeliveryChallanBillType


class DeliveryChallanCreate(BaseModel):
    invoice_id: int
    bill_type: DeliveryChallanBillType = DeliveryChallanBillType.cash_bill
    vehicle_number: Optional[str] = None
    transporter_name: Optional[str] = None
    delivery_date: Optional[date] = None
    notes: Optional[str] = None


class DeliveryChallanOut(BaseModel):
    id: int
    challan_number: str
    invoice_id: int
    bill_type: DeliveryChallanBillType
    vehicle_number: Optional[str]
    transporter_name: Optional[str]
    delivery_date: date
    notes: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True
