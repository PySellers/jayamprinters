from .auth import router as auth_router
from .customer import router as customer_router

__all__ = ["auth_router", "customer_router"]
