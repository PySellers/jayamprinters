from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional

from app.core.database import get_db
from app.models.attribute import Attribute, AttributeOption
from app.schemas.attribute import (
    AttributeCreate, AttributeUpdate, AttributeOut,
    AttributeOptionCreate, AttributeOptionUpdate, AttributeOptionOut,
)

router = APIRouter(prefix="/attributes", tags=["attributes"])


@router.get("/", response_model=List[AttributeOut])
def get_attributes(category_id: Optional[int] = None, db: Session = Depends(get_db)):
    query = db.query(Attribute)
    if category_id is not None:
        query = query.filter(Attribute.category_id == category_id)
    return query.all()


@router.get("/{attribute_id}", response_model=AttributeOut)
def get_attribute(attribute_id: int, db: Session = Depends(get_db)):
    attribute = db.query(Attribute).filter(Attribute.id == attribute_id).first()
    if not attribute:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attribute not found")
    return attribute


@router.post("/", response_model=AttributeOut, status_code=status.HTTP_201_CREATED)
def create_attribute(data: AttributeCreate, db: Session = Depends(get_db)):
    attribute = Attribute(**data.model_dump())
    db.add(attribute)
    db.commit()
    db.refresh(attribute)
    return attribute


@router.put("/{attribute_id}", response_model=AttributeOut)
def update_attribute(attribute_id: int, data: AttributeUpdate, db: Session = Depends(get_db)):
    attribute = db.query(Attribute).filter(Attribute.id == attribute_id).first()
    if not attribute:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attribute not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(attribute, key, value)
    db.commit()
    db.refresh(attribute)
    return attribute


@router.delete("/{attribute_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_attribute(attribute_id: int, db: Session = Depends(get_db)):
    attribute = db.query(Attribute).filter(Attribute.id == attribute_id).first()
    if not attribute:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attribute not found")
    db.delete(attribute)
    db.commit()
    return None


@router.post("/{attribute_id}/options", response_model=AttributeOptionOut, status_code=status.HTTP_201_CREATED)
def create_attribute_option(attribute_id: int, data: AttributeOptionCreate, db: Session = Depends(get_db)):
    attribute = db.query(Attribute).filter(Attribute.id == attribute_id).first()
    if not attribute:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attribute not found")
    option = AttributeOption(attribute_id=attribute_id, **data.model_dump())
    db.add(option)
    db.commit()
    db.refresh(option)
    return option


@router.put("/options/{option_id}", response_model=AttributeOptionOut)
def update_attribute_option(option_id: int, data: AttributeOptionUpdate, db: Session = Depends(get_db)):
    option = db.query(AttributeOption).filter(AttributeOption.id == option_id).first()
    if not option:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attribute option not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(option, key, value)
    db.commit()
    db.refresh(option)
    return option


@router.delete("/options/{option_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_attribute_option(option_id: int, db: Session = Depends(get_db)):
    option = db.query(AttributeOption).filter(AttributeOption.id == option_id).first()
    if not option:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attribute option not found")
    db.delete(option)
    db.commit()
    return None
