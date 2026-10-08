from pydantic import BaseModel
from typing import List, Optional
from datetime import date


class ChallanItem(BaseModel):
    particulars: str = ""
    qty: str = ""


class DeliveryChallanSave(BaseModel):
    challan_date: date
    to_text: str = ""
    items: List[ChallanItem] = []


class DeliveryChallanCreate(DeliveryChallanSave):
    job_card_id: int


class DeliveryChallanOut(BaseModel):
    # id is None for an unsaved draft: dc_number is then only a preview of the next S.No.
    id: Optional[int] = None
    financial_year: int
    financial_year_label: str
    dc_number: int
    job_card_id: Optional[int] = None
    customer_id: int
    challan_date: date
    to_text: str = ""
    items: List[ChallanItem] = []