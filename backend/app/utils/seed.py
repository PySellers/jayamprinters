from app.core.database import Base, SessionLocal, engine
from app.models.user import UserRole
from app.repositories.user_repository import UserRepository
from app.services.auth_service import get_password_hash


def seed_user():
    """Bootstraps the very first login. There's no public self-registration
    (by design -- a printing shop's staff accounts shouldn't be self-service),
    so this is how the chicken-and-egg problem of "you need an Admin to create
    users, but user creation is Admin-only" gets solved: run this once against
    a fresh database, log in as the seeded Admin, then create real staff
    accounts (with their real roles) from the Users page."""
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        repo = UserRepository(db)
        existing = repo.get_by_email("admin@srijayam.com")
        if existing:
            print("Admin user already exists")
            return

        hashed_password = get_password_hash("Admin@123")
        repo.create(name="Admin User", email="admin@srijayam.com", hashed_password=hashed_password, role=UserRole.admin)
        print("Seeded admin user: admin@srijayam.com / Admin@123 (role: admin) -- change this password immediately.")
    finally:
        db.close()


if __name__ == "__main__":
    seed_user()
