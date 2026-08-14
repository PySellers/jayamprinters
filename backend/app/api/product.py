from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from typing import List

from app.core.database import get_db
from app.core.security import require_role
from app.models.product import ProductCategory, Product
from app.models.user import UserRole
from app.schemas.product import (
    ProductCategoryCreate, ProductCategoryUpdate, ProductCategoryOut,
    ProductCreate, ProductUpdate, ProductOut,
)

router = APIRouter(tags=["products"])
category_router = APIRouter(prefix="/product-categories", tags=["products"])
product_router = APIRouter(prefix="/products", tags=["products"])
admin_write = [Depends(require_role(UserRole.admin))]


@category_router.get("/", response_model=List[ProductCategoryOut])
def get_categories(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(ProductCategory).offset(skip).limit(limit).all()


@category_router.get("/{category_id}", response_model=ProductCategoryOut)
def get_category(category_id: int, db: Session = Depends(get_db)):
    category = db.query(ProductCategory).filter(ProductCategory.id == category_id).first()
    if not category:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product category not found")
    return category


@category_router.post("/", response_model=ProductCategoryOut, status_code=status.HTTP_201_CREATED, dependencies=admin_write)
def create_category(data: ProductCategoryCreate, db: Session = Depends(get_db)):
    category = ProductCategory(**data.model_dump())
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


@category_router.put("/{category_id}", response_model=ProductCategoryOut, dependencies=admin_write)
def update_category(category_id: int, data: ProductCategoryUpdate, db: Session = Depends(get_db)):
    category = db.query(ProductCategory).filter(ProductCategory.id == category_id).first()
    if not category:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product category not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(category, key, value)
    db.commit()
    db.refresh(category)
    return category


@category_router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=admin_write)
def delete_category(category_id: int, db: Session = Depends(get_db)):
    category = db.query(ProductCategory).filter(ProductCategory.id == category_id).first()
    if not category:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product category not found")
    db.delete(category)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Product category is in use, cannot delete")
    return None


@product_router.get("/", response_model=List[ProductOut])
def get_products(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(Product).offset(skip).limit(limit).all()


@product_router.get("/{product_id}", response_model=ProductOut)
def get_product(product_id: int, db: Session = Depends(get_db)):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    return product


@product_router.post("/", response_model=ProductOut, status_code=status.HTTP_201_CREATED, dependencies=admin_write)
def create_product(data: ProductCreate, db: Session = Depends(get_db)):
    product = Product(**data.model_dump())
    db.add(product)
    db.commit()
    db.refresh(product)
    return product


@product_router.put("/{product_id}", response_model=ProductOut, dependencies=admin_write)
def update_product(product_id: int, data: ProductUpdate, db: Session = Depends(get_db)):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(product, key, value)
    db.commit()
    db.refresh(product)
    return product


@product_router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=admin_write)
def delete_product(product_id: int, db: Session = Depends(get_db)):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    db.delete(product)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Product is in use, cannot delete")
    return None


router.include_router(category_router)
router.include_router(product_router)
