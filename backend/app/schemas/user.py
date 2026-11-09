from typing import Optional

from pydantic import BaseModel, EmailStr

from app.models.user import UserRole


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: UserRole = UserRole.counter
    phone: Optional[str] = None


class UserUpdate(BaseModel):
    """Admin-only edits to an existing staff account. Password is optional --
    only send it when actually resetting someone's password."""
    name: Optional[str] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None
    phone: Optional[str] = None


class UserOut(BaseModel):
    id: int
    name: str
    email: str
    role: UserRole
    is_active: bool
    phone: Optional[str] = None

    class Config:
        from_attributes = True
