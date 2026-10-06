from pydantic import BaseModel

from app.models.user import UserRole


class Token(BaseModel):
    access_token: str
    token_type: str


class TokenData(BaseModel):
    email: str | None = None


class UserRead(BaseModel):
    id: int
    name: str
    email: str
    role: UserRole

    model_config = {
        "from_attributes": True,
    }


class AuthResponse(Token):
    user: UserRead
