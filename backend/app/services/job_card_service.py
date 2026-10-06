from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.models.quotation import Quotation, QuotationStatus
from app.models.job_card import JobCard


def generate_job_number(db: Session) -> str:
    count = db.query(JobCard).count() + 1
    return f"JC-{count:05d}"


def convert_quotation_to_job_cards(db: Session, quotation_id: int) -> List[JobCard]:
    quotation = db.query(Quotation).filter(Quotation.id == quotation_id).first()
    if not quotation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quotation not found")
    if quotation.status == QuotationStatus.converted:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Quotation already converted to job cards")

    job_cards = []
    for item in quotation.items:
        job_card = JobCard(
            job_number=generate_job_number(db),
            quotation_item_id=item.id,
            customer_id=quotation.customer_id,
            product_id=item.product_id,
            notes=item.spec_notes,
            delivery_date=quotation.delivery_date,
        )
        db.add(job_card)
        db.flush()
        job_cards.append(job_card)

    quotation.status = QuotationStatus.converted
    db.commit()
    for job_card in job_cards:
        db.refresh(job_card)
    return job_cards
