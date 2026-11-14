from datetime import timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.schemas.auth import AuthResponse, UserRead
from app.services.auth_service import authenticate_user, create_access_token, get_password_hash, verify_password

APP_VERSION = "1.4.0"
APP_RELEASE_DATE = "2026-11-14"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ProfileUpdate(BaseModel):
    """What an employee may change about themselves: name and phone. Role and e-mail are the admin's to change."""
    name: Optional[str] = Field(default=None, min_length=1)
    phone: Optional[str] = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=6)


class ContactOut(BaseModel):
    id: int
    name: str
    email: str
    role: str
    phone: Optional[str] = None


router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=AuthResponse)
async def login(request: LoginRequest, db: Session = Depends(get_db)):
    user = authenticate_user(db, request.email, request.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )
    # the session length comes from settings (3 hours)
    access_token = create_access_token(data={"sub": user.email}, expires_delta=timedelta(minutes=settings.SESSION_MINUTES))
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user,
    }


@router.get("/me", response_model=UserRead)
async def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.patch("/me", response_model=UserRead)
def update_my_profile(data: ProfileUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    changes = data.model_dump(exclude_unset=True)
    if "name" in changes and changes["name"] is not None:
        current_user.name = changes["name"].strip()
    if "phone" in changes:
        current_user.phone = (changes["phone"] or "").strip() or None
    db.commit()
    db.refresh(current_user)
    return current_user


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_my_password(data: PasswordChange, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not verify_password(data.current_password, current_user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="The current password is not correct")
    if data.current_password == data.new_password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Choose a new password that is different from the current one")
    current_user.hashed_password = get_password_hash(data.new_password)
    db.commit()
    return None


@router.get("/contacts", response_model=List[ContactOut])
def contacts(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Everyone's name, role and phone for the Contacts page (admin first). Open to every signed-in employee."""
    rows = db.query(User).filter(User.is_active.is_(True)).all()
    rows.sort(key=lambda u: (0 if u.role.value == "admin" else 1, (u.name or "").lower()))
    return [ContactOut(id=u.id, name=u.name, email=u.email, role=u.role.value, phone=u.phone) for u in rows]


@router.get("/about")
def about(current_user: User = Depends(get_current_user)):
    return {
        "product": "Sri Jayam Printers ERP",
        "version": APP_VERSION,
        "release_date": APP_RELEASE_DATE,
        "session_hours": round(settings.SESSION_MINUTES / 60, 1),
    }
