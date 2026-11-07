"""
Production workflow set-up (Nov 2026). Safe to re-run.

  * creates the default work centers and the step templates of every service (if missing)
  * gives every existing job card its steps, at the step its current status says
  * --demo-staff: UAT / demo only - adds a printing and a binding employee, and puts the demo staff in work centers,
    so the hand-offs can be tried with several logins (same demo password as the other demo staff).

Usage:
    cd backend && venv\\Scripts\\activate && python seed_workflow.py [--demo-staff]
"""
import sys

from app.core.database import SessionLocal
from app.models.job_card import JobCard
from app.models.user import User, UserRole
from app.models.workflow import WorkCenter
from app.services import workflow_service as wf
from app.services.auth_service import get_password_hash

DEMO_PASSWORD = "Uat@12345"
DEMO_STAFF = [  # name, email, role, work centers
    ("Raja (Printing)", "printer@srijayam.com", UserRole.production, ["Printing"]),
    ("Selvam (Binding)", "binder@srijayam.com", UserRole.production, ["Finishing & Binding", "Xerox Counter"]),
]
DEMO_MEMBERSHIP = {  # existing demo staff -> work centers (only filled when they have none yet)
    "designer@srijayam.com": ["Design"],
    "counter@srijayam.com": ["Front Desk"],
}


def main(demo_staff: bool) -> None:
    db = SessionLocal()
    wf.ensure_defaults(db)
    db.commit()

    done = 0
    for job in db.query(JobCard).filter(~JobCard.steps.any()).order_by(JobCard.id).all():
        wf.create_steps_for_job(db, job, log_event=False)
        done += 1
        if done % 100 == 0:
            db.commit()
    db.commit()
    print(f"Workflow ready: {db.query(WorkCenter).count()} work centers, {done} job cards given their steps.")

    if demo_staff:
        centers = {c.name: c for c in db.query(WorkCenter).all()}
        for name, email, role, names in DEMO_STAFF:
            user = db.query(User).filter_by(email=email).first()
            if user is None:
                user = User(name=name, email=email, hashed_password=get_password_hash(DEMO_PASSWORD), role=role, is_active=True)
                db.add(user)
                db.flush()
            for center in names:
                if user not in centers[center].members:
                    centers[center].members.append(user)
        for email, names in DEMO_MEMBERSHIP.items():
            user = db.query(User).filter_by(email=email).first()
            if user is not None and not user.work_centers:
                for center in names:
                    centers[center].members.append(user)
        db.commit()
        print(f"Demo staff ready (password {DEMO_PASSWORD}): " + ", ".join(e for _, e, _, _ in DEMO_STAFF))


if __name__ == "__main__":
    main("--demo-staff" in sys.argv)
