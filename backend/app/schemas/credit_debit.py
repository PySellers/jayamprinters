from datetime import date, datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field, field_validator


class CreditDebitIn(BaseModel):
    """One entry of the Credit / Debit book."""
    kind: Literal["credit", "debit"]
    name: str = Field(min_length=1, max_length=120)
    amount: float = Field(gt=0, le=1_000_000_000)
    note: Optional[str] = Field(default=None, max_length=500)
    entry_date: Optional[date] = None  # blank = today

    @field_validator("name")
    @classmethod
    def _strip_name(cls, v: str) -> str:
        v = " ".join(v.split())
        if not v:
            raise ValueError("Name is required")
        return v

    @field_validator("amount")
    @classmethod
    def _two_places(cls, v: float) -> float:
        return round(v, 2)


class CreditDebitUpdate(BaseModel):
    """Everything an entry can be corrected to (the kind cannot change: enter it again on the other side instead)."""
    name: str = Field(min_length=1, max_length=120)
    amount: float = Field(gt=0, le=1_000_000_000)
    note: Optional[str] = Field(default=None, max_length=500)
    entry_date: date

    @field_validator("name")
    @classmethod
    def _strip_name(cls, v: str) -> str:
        v = " ".join(v.split())
        if not v:
            raise ValueError("Name is required")
        return v

    @field_validator("amount")
    @classmethod
    def _two_places(cls, v: float) -> float:
        return round(v, 2)


class CreditDebitOut(BaseModel):
    id: int
    kind: str
    name: str
    amount: float
    note: Optional[str] = None
    entry_date: date
    created_by: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class NameBalance(BaseModel):
    name: str
    credit: float
    debit: float
    net: float  # credit - debit


class CreditDebitSummary(BaseModel):
    credit_total: float
    debit_total: float
    net: float
    credit_count: int
    debit_count: int
    by_name: List[NameBalance]
