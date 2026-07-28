from app.core.database import Base, SessionLocal, engine
from app.repositories.user_repository import UserRepository
from app.services.auth_service import get_password_hash


def seed_user():
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        repo = UserRepository(db)
        existing = repo.get_by_email("admin@srijayam.com")
        if existing:
            print("Admin user already exists")
            return

        hashed_password = get_password_hash("Admin@123")
        repo.create(name="Admin User", email="admin@srijayam.com", hashed_password=hashed_password)
        print("Seeded admin user: admin@srijayam.com / Admin@123")
    finally:
        db.close()


if __name__ == "__main__":
    seed_user()
