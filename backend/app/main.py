from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware

from app.api import auth, customer, quotation, masters, tax, product, job_card, invoice, user
from app.api import attribute, quantity_slab, price_matrix, extra_charge
from app.core.security import get_current_user

app = FastAPI(
    title="Sri Jayam Printers ERP",
    description="Cloud-based Printing ERP System",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# /auth/login must stay public (it's how a token is obtained); everything else requires one.
authenticated = [Depends(get_current_user)]

app.include_router(auth.router, prefix="/api/v1")
app.include_router(customer.router, prefix="/api/v1", dependencies=authenticated)
app.include_router(quotation.router, prefix="/api/v1", dependencies=authenticated)
app.include_router(masters.router, prefix="/api/v1", dependencies=authenticated)
app.include_router(tax.router, prefix="/api/v1", dependencies=authenticated)
app.include_router(product.router, prefix="/api/v1", dependencies=authenticated)
app.include_router(job_card.router, prefix="/api/v1", dependencies=authenticated)
app.include_router(invoice.router, prefix="/api/v1", dependencies=authenticated)
app.include_router(user.router, prefix="/api/v1", dependencies=authenticated)
app.include_router(attribute.router, prefix="/api/v1", dependencies=authenticated)
app.include_router(quantity_slab.router, prefix="/api/v1", dependencies=authenticated)
app.include_router(price_matrix.router, prefix="/api/v1", dependencies=authenticated)
app.include_router(extra_charge.router, prefix="/api/v1", dependencies=authenticated)

@app.get("/")
def root():
    return {"message": "Sri Jayam Printers ERP is running ✅"}

@app.get("/health")
def health():
    return {"status": "healthy"}
