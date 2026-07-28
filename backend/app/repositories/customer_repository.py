from sqlalchemy.orm import Session

from app.models.customer import Customer


class CustomerRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_all(self) -> list[Customer]:
        return self.db.query(Customer).order_by(Customer.created_at.desc()).all()

    def get_by_id(self, customer_id: int) -> Customer | None:
        return self.db.query(Customer).filter(Customer.id == customer_id).first()

    def create(self, name: str, phone: str, email: str | None, address: str | None, gstin: str | None, notes: str | None) -> Customer:
        customer = Customer(
            name=name,
            phone=phone,
            email=email,
            address=address,
            gstin=gstin,
            notes=notes,
        )
        self.db.add(customer)
        self.db.commit()
        self.db.refresh(customer)
        return customer

    def update(self, customer: Customer, **kwargs) -> Customer:
        for key, value in kwargs.items():
            if value is not None:
                setattr(customer, key, value)
        self.db.add(customer)
        self.db.commit()
        self.db.refresh(customer)
        return customer

    def delete(self, customer: Customer) -> None:
        self.db.delete(customer)
        self.db.commit()
