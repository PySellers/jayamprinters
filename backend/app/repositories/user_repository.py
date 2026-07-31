from sqlalchemy.orm import Session

from app.models.user import User, UserRole


class UserRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_email(self, email: str) -> User | None:
        return self.db.query(User).filter(User.email == email).first()

    def create(
        self,
        name: str,
        email: str,
        hashed_password: str,
        role: UserRole = UserRole.counter,
        department: str | None = None,
    ) -> User:
        user = User(name=name, email=email, hashed_password=hashed_password, role=role, department=department)
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user
