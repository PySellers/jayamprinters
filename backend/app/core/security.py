from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.user import User, UserRole
from app.services.auth_service import decode_access_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/v1/auth/login")


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    token_data = decode_access_token(token)
    if token_data is None or token_data.email is None:
        raise credentials_exception
    user = db.query(User).filter(User.email == token_data.email).first()
    if user is None or not user.is_active:
        raise credentials_exception
    return user


def require_role(*allowed_roles: UserRole):
    """Route dependency factory: `dependencies=[Depends(require_role(UserRole.admin))]`.

    Re-checks the role against the DB-loaded user (via get_current_user), not a
    claim baked into the JWT, so a role change takes effect on the user's very
    next request rather than only after their token expires. Admin always
    passes regardless of the allowed_roles list -- Admin is "can do anything"
    by definition in this system, not just another role to enumerate everywhere.
    """

    def dependency(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role == UserRole.admin or current_user.role in allowed_roles:
            return current_user
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"This action requires one of these roles: {', '.join(r.value for r in allowed_roles)} (or admin).",
        )

    return dependency
