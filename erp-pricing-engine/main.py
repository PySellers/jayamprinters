"""
Runnable entry point for the pricing-engine scaffold.

    python main.py            -> http://localhost:8000/docs

This is meant to be merged into the existing FastAPI project (which already
has auth + Customer CRUD): copy `app/models.py`, `app/pricing_engine.py`,
`app/schemas.py`, and the two routers in, then include them in that project's
main app instead of running this one standalone.
"""
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine, SessionLocal
from app.routers import catalog, quotes, parties, jobs, orders, reports, auth, accounts
from app.seed_data import seed, seed_users

app = FastAPI(
    title="Sri Jayam Printers - Pricing Engine (scaffold)",
    description="Product catalog + pricing engine per Section 6 of the ERP blueprint doc.",
    version="0.4.0",
)

# Wide-open CORS so the standalone order_entry.html demo (opened straight from
# the filesystem, origin "null") can call this API. Tighten this to your real
# frontend's origin before this goes anywhere near production.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(catalog.router)
app.include_router(quotes.router)
app.include_router(parties.router)
app.include_router(jobs.router)
app.include_router(orders.router)
app.include_router(reports.router)
app.include_router(accounts.router)


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed(db)
        seed_users(db)
    finally:
        db.close()


@app.get("/")
def root():
    return {"status": "ok", "docs": "/docs"}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
