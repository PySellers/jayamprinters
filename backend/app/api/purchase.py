from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from sqlalchemy.orm import Session
from typing import List

from app.core.database import get_db
from app.core.security import require_role
from app.models.purchase import Purchase, PurchaseBill
from app.models.user import UserRole
from app.schemas.purchase import BillScanOut, PurchaseCreate, PurchaseOut, PurchasePaymentCreate
from app.services.bill_reader_service import IMAGE_TYPES, MAX_BYTES, PDF_TYPE, attach_matches, read_bill
from app.services.purchase_service import create_purchase, record_purchase_payment

router = APIRouter(prefix="/purchases", tags=["purchases"])
# Reads open to any logged-in staff (production/counter may want to check
# what's on order); recording a purchase or a payment against one is
# Admin/Accounts only, same reasoning as the cash ledger.
write_roles = [Depends(require_role(UserRole.admin, UserRole.accounts))]


def _mark_bills(db: Session, purchases):
    ids = [p.id for p in purchases]
    with_bill = {row[0] for row in db.query(PurchaseBill.purchase_id).filter(PurchaseBill.purchase_id.in_(ids)).all()} if ids else set()
    for p in purchases:
        p.has_bill = p.id in with_bill
    return purchases


@router.get("/", response_model=List[PurchaseOut])
def get_purchases(skip: int = 0, limit: int = 5000, db: Session = Depends(get_db)):
    return _mark_bills(db, db.query(Purchase).order_by(Purchase.id.desc()).offset(skip).limit(limit).all())


@router.post("/scan-bill", response_model=BillScanOut, dependencies=write_roles)
async def scan_bill(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Reads a supplier's bill (photo or PDF) into a DRAFT purchase for staff to check. Nothing is saved here."""
    data = await file.read()
    return attach_matches(db, read_bill(data, file.content_type or "", file.filename or ""))


@router.get("/{purchase_id}", response_model=PurchaseOut)
def get_purchase(purchase_id: int, db: Session = Depends(get_db)):
    purchase = db.query(Purchase).filter(Purchase.id == purchase_id).first()
    if not purchase:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Purchase not found")
    return purchase


@router.post("/", response_model=PurchaseOut, status_code=status.HTTP_201_CREATED, dependencies=write_roles)
def post_purchase(data: PurchaseCreate, db: Session = Depends(get_db)):
    return create_purchase(db, data)


@router.post("/{purchase_id}/bill", dependencies=write_roles)
async def attach_bill(purchase_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Keeps the supplier's original bill with the purchase (replaces an earlier one)."""
    if not db.query(Purchase.id).filter(Purchase.id == purchase_id).first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Purchase not found")
    content_type = file.content_type or ""
    if content_type not in IMAGE_TYPES | {PDF_TYPE}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Upload a photo (JPG, PNG, WEBP) or a PDF of the bill.")
    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="That file is too large - keep it under 8 MB.")
    bill = db.query(PurchaseBill).filter(PurchaseBill.purchase_id == purchase_id).first()
    if bill is None:
        bill = PurchaseBill(purchase_id=purchase_id)
        db.add(bill)
    bill.filename, bill.content_type, bill.data = file.filename, content_type, data
    db.commit()
    return {"detail": "Bill saved", "filename": bill.filename}


@router.get("/{purchase_id}/bill")
def download_bill(purchase_id: int, db: Session = Depends(get_db)):
    bill = db.query(PurchaseBill).filter(PurchaseBill.purchase_id == purchase_id).first()
    if bill is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No bill was uploaded for this purchase")
    return Response(
        content=bill.data,
        media_type=bill.content_type,
        headers={"Content-Disposition": f'inline; filename="{bill.filename or "bill"}"'},
    )


@router.post("/{purchase_id}/payments", response_model=PurchaseOut, dependencies=write_roles)
def post_purchase_payment(purchase_id: int, data: PurchasePaymentCreate, db: Session = Depends(get_db)):
    return record_purchase_payment(db, purchase_id, data)
