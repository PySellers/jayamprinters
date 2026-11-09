"""
Client round 4 set-up (Nov 2026). Safe to re-run.

  * creates one ordinary employee login for testing the app as a normal user (not the Admin):
        staff@srijayam.com  (role: production - can take and finish tasks, cannot open Pricing Setup, Users or the AI Insights)
    The employee is in no work center, so they can take any task nobody has taken yet; the admin can narrow that down
    under Masters > Work Centers.
  * the same demo password as the other demo staff. Delete or change the login before real use.

Usage:
    cd backend && venv\\Scripts\\activate && python seed_round4.py
"""
from app.core.database import SessionLocal
from app.models.user import User, UserRole
from app.services.auth_service import get_password_hash

DEMO_PASSWORD = "Uat@12345"
EMPLOYEE = ("Staff User", "staff@srijayam.com", UserRole.production)


def main() -> None:
    db = SessionLocal()
    try:
        name, email, role = EMPLOYEE
        user = db.query(User).filter(User.email == email).first()
        if user is None:
            db.add(User(name=name, email=email, hashed_password=get_password_hash(DEMO_PASSWORD), role=role, is_active=True))
            print(f"created employee login {email}")
        else:
            user.is_active = True
            user.role = role
            print(f"employee login {email} already exists (made sure it is active)")
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    main()
