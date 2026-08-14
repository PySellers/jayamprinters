from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware

from app.api import auth, customer, quotation, masters, tax, product, job_card, invoice, user
from app.api import attribute, quantity_slab, price_matrix, extra_charge, reports
from app.api import vendor, purchase, inventory, cash_ledger
from app.core.security import get_current_user, require_role
from app.models.user import UserRole

app = FastAPI(
    title="Sri Jayam Printers ERP",
    description="Cloud-based Printing ERP System",
    version="1.1.0"
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

# Role gating beyond "logged in" happens two ways in this app:
#  - Whole routers that are single-purpose for one audience (user management,
#    cash ledger) get gated here, at registration, so it's visible in one
#    place which entire modules are restricted.
#  - Routers that mix open reads with sensitive writes (pricing setup,
#    masters, invoices, job cards) gate individual POST/PUT/PATCH/DELETE
#    routes instead, via `dependencies=[Depends(require_role(...))]` on the
#    route decorator itself in that router's own file -- see attribute.py,
#    price_matrix.py, quantity_slab.py, extra_charge.py, product.py,
#    masters.py, tax.py, invoice.py, job_card.py.
admin_only = authenticated + [Depends(require_role(UserRole.admin))]
accounts_and_admin = authenticated + [Depends(require_role(UserRole.admin, UserRole.accounts))]

app.include_router(auth.router, prefix="/api/v1")
app.include_router(customer.router, prefix="/api/v1", dependencies=authenticated)
app.include_router(quotation.router, prefix="/api/v1", dependencies=authenticated)
app.include_router(masters.router, prefix="/api/v1", dependencies=authenticated)
app.include_router(tax.router, prefix="/api/v1", dependencies=authenticated)
app.include_router(product.router, prefix="/api/v1", dependencies=authenticated)
app.include_router(job_card.router, prefix="/api/v1", dependencies=authenticated)
app.include_router(invoice.router, prefix="/api/v1", dependencies=authenticated)
app.include_router(user.router, prefix="/api/v1", dependencies=admin_only)
app.include_router(attribute.router, prefix="/api/v1", dependencies=authenticated)
app.include_router(quantity_slab.router, prefix="/api/v1", dependencies=authenticated)
app.include_router(price_matrix.router, prefix="/api/v1", dependencies=authenticated)
app.include_router(extra_charge.router, prefix="/api/v1", dependencies=authenticated)
app.include_router(reports.router, prefix="/api/v1", dependencies=authenticated)
app.include_router(vendor.router, prefix="/api/v1", dependencies=authenticated)
app.include_router(purchase.router, prefix="/api/v1", dependencies=authenticated)
app.include_router(inventory.router, prefix="/api/v1", dependencies=authenticated)
app.include_router(cash_ledger.router, prefix="/api/v1", dependencies=accounts_and_admin)

@app.get("/")
def root():
    return {"message": "Sri Jayam Printers ERP is running ✅"}

@app.get("/health")
def health():
    return {"status": "healthy"}
