from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Party
from app.schemas import PartyIn, PartyOut

router = APIRouter(prefix="/parties", tags=["parties"])


@router.get("", response_model=list[PartyOut])
def list_parties(db: Session = Depends(get_db)):
    return db.query(Party).order_by(Party.id.desc()).all()


@router.post("", response_model=PartyOut, status_code=201)
def create_party(payload: PartyIn, db: Session = Depends(get_db)):
    party = Party(**payload.model_dump())
    db.add(party)
    db.commit()
    db.refresh(party)
    return party


@router.get("/{party_id}", response_model=PartyOut)
def get_party(party_id: int, db: Session = Depends(get_db)):
    party = db.query(Party).filter(Party.id == party_id).first()
    if party is None:
        raise HTTPException(status_code=404, detail=f"Unknown party id {party_id}")
    return party
