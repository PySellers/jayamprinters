import enum

from sqlalchemy import Boolean, Column, Enum, Integer, String
from app.core.database import Base


class UserRole(str, enum.Enum):
    admin = "admin"
    counter = "counter"
    production = "production"
    accounts = "accounts"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(Enum(UserRole), nullable=False, default=UserRole.counter, server_default=UserRole.counter.value)
    is_active = Column(Boolean, default=True)
