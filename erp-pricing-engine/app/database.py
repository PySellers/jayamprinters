"""
Database setup for the pricing-engine scaffold.

Defaults to a local SQLite file so it runs with zero external setup. Point
DATABASE_URL at Postgres (the recommended production store, per Section 7.3 of
the blueprint doc) when merging this into the real backend, e.g.:

    export DATABASE_URL="postgresql+psycopg://user:pass@host:5432/srijayam_erp"
"""
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./erp.db")

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
