from sqlalchemy import Column, Integer, String, Float, Boolean
from app.core.database import Base


class PrintingType(Base):
    __tablename__ = "printing_types"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    is_active = Column(Boolean, default=True)


class Machine(Base):
    __tablename__ = "machines"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    is_active = Column(Boolean, default=True)


class Tax(Base):
    __tablename__ = "taxes"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    rate_percent = Column(Float)
    is_default = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
