"""
Minimal role-based auth for THIS SCAFFOLD ONLY.

Important: the real project already has working register/login (JWT-style,
tested via Swagger, per your update). This module exists only so the
role-gating pattern (require_role()) can be demonstrated and the admin-only
endpoints/pages in this scaffold are not wide open. On merge:
  - drop app/models.py::User and this file,
  - reuse the real app's existing auth/user system,
  - carry over the `UserRole` enum and copy the `require_role()` dependency
    (or the equivalent already in that codebase) onto the endpoints flagged
    below with `Depends(require_role(...))`.

The actual hashing/token logic (stdlib only, no extra pip deps) lives in
app/security.py; this module just wires it into FastAPI dependencies.
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, UserRole
from app.security import hash_password, verify_password, decode_token, TokenError, create_token_payload

__all__ = ["hash_password", "verify_password", "create_token", "get_current_user", "require_role"]

_bearer_scheme = HTTPBearer(auto_error=False)


def create_token(user: User) -> str:
    role = user.role.value if hasattr(user.role, "value") else user.role
    return create_token_payload(user.id, user.username, role)


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if creds is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")
    try:
        payload = decode_token(creds.credentials)
    except TokenError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc
    user = db.query(User).filter(User.id == payload["sub"]).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


def require_role(*allowed_roles: UserRole):
    """FastAPI dependency factory: Depends(require_role(UserRole.ADMIN))"""

    def _dep(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires role in {[r.value for r in allowed_roles]}, you are '{user.role.value}'",
            )
        return user

    return _dep
