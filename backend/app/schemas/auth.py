from pydantic import BaseModel


class Token(BaseModel):
    access_token: str
    token_type: str


class TokenData(BaseModel):
    email: str | None = None


class UserRead(BaseModel):
    id: int
    name: str
    email: str

    model_config = {
        "from_attributes": True,
    }


class AuthResponse(Token):
    user: UserRead
