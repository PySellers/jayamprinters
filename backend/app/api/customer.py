import re

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.core.database import get_db
from app.models.customer import Customer
from app.schemas.customer import BillingDefaults, CustomerCreate, CustomerResponse, CustomerUpdate

router = APIRouter(prefix="/customers", tags=["customers"])

_PERSON_NAME = re.compile(r"^\s*Person\s+(\d+)\s*$", re.IGNORECASE)


def next_person_name(db: Session) -> str:
    """'Person N' for the next walk-in, one above the highest existing number.
    Looks at both billing_person_name and name since an unnamed order stores the
    placeholder in either; counting rows instead would drift as soon as a real
    name replaces a placeholder."""
    highest = 0
    rows = db.query(Customer.billing_person_name, Customer.name).filter(
        Customer.billing_person_name.ilike("Person %") | Customer.name.ilike("Person %")
    ).all()
    for billing_name, name in rows:
        for value in (billing_name, name):
            match = _PERSON_NAME.match(value or "")
            if match:
                highest = max(highest, int(match.group(1)))
    return f"Person {highest + 1}"


# Declared before "/{customer_id}" so the literal path is not parsed as an id.
@router.get("/billing-defaults", response_model=BillingDefaults)
def get_billing_defaults(db: Session = Depends(get_db)):
    recent = db.query(Customer).order_by(Customer.created_at.desc(), Customer.id.desc()).limit(8).all()
    return BillingDefaults(next_person_name=next_person_name(db), recent_customers=recent)


@router.get("/", response_model=List[CustomerResponse])
def get_customers(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(Customer).offset(skip).limit(limit).all()


@router.get("/{customer_id}", response_model=CustomerResponse)
def get_customer(customer_id: int, db: Session = Depends(get_db)):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")
    return customer


@router.post("/", response_model=CustomerResponse, status_code=status.HTTP_201_CREATED)
def create_customer(data: CustomerCreate, db: Session = Depends(get_db)):
    if data.phone:
        existing = db.query(Customer).filter(Customer.phone == data.phone).first()
        if existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Phone number already exists")
    customer = Customer(**data.model_dump())
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer


@router.put("/{customer_id}", response_model=CustomerResponse)
def update_customer(customer_id: int, data: CustomerUpdate, db: Session = Depends(get_db)):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(customer, key, value)
    db.commit()
    db.refresh(customer)
    return customer


@router.delete("/{customer_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_customer(customer_id: int, db: Session = Depends(get_db)):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")
    db.delete(customer)
    db.commit()
    return None


@router.get("/search/{query}", response_model=List[CustomerResponse])
def search_customers(query: str, db: Session = Depends(get_db)):
    return (
        db.query(Customer)
        .filter(
            Customer.name.ilike(f"%{query}%")
            | Customer.billing_person_name.ilike(f"%{query}%")
            | Customer.phone.ilike(f"%{query}%")
        )
        .order_by(Customer.created_at.desc(), Customer.id.desc())
        .limit(25)
        .all()
    )
