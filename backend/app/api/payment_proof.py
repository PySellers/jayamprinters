"""The UPI screenshot / bank slip / receipt kept with a payment (sales, purchase or outsource)."""
from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.invoice import Payment
from app.models.outsource import OutsourcePayment
from app.models.payment_proof import PaymentProof
from app.models.purchase import PurchasePayment
from app.models.user import User, UserRole
from app.services.bill_reader_service import IMAGE_TYPES, MAX_BYTES, PDF_TYPE

router = APIRouter(prefix="/payment-proofs", tags=["payments"])

TABLES = {"sale": Payment, "purchase": PurchasePayment, "outsource": OutsourcePayment}


def _check(db: Session, kind: str, payment_id: int, user: User, writing: bool) -> None:
    table = TABLES.get(kind)
    if table is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown payment kind")
    if not db.query(table.id).filter(table.id == payment_id).first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found")
    if writing and kind in ("purchase", "outsource") and user.role not in (UserRole.admin, UserRole.accounts, UserRole.counter):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot change this payment")


@router.post("/{kind}/{payment_id}")
async def upload_proof(kind: str, payment_id: int, file: UploadFile = File(...), db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _check(db, kind, payment_id, user, writing=True)
    content_type = file.content_type or ""
    if content_type not in IMAGE_TYPES | {PDF_TYPE}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Upload a photo (JPG, PNG, WEBP) or a PDF.")
    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="That file is too large - keep it under 8 MB.")
    proof = db.query(PaymentProof).filter(PaymentProof.kind == kind, PaymentProof.payment_id == payment_id).first()
    if proof is None:
        proof = PaymentProof(kind=kind, payment_id=payment_id)
        db.add(proof)
    proof.filename, proof.content_type, proof.data = file.filename, content_type, data
    db.commit()
    return {"detail": "Saved", "filename": proof.filename}


@router.get("/{kind}/{payment_id}")
def download_proof(kind: str, payment_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _check(db, kind, payment_id, user, writing=False)
    proof = db.query(PaymentProof).filter(PaymentProof.kind == kind, PaymentProof.payment_id == payment_id).first()
    if proof is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No receipt was uploaded for this payment")
    return Response(
        content=proof.data, media_type=proof.content_type,
        headers={"Content-Disposition": f'inline; filename="{proof.filename or "receipt"}"'},
    )


@router.delete("/{kind}/{payment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_proof(kind: str, payment_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _check(db, kind, payment_id, user, writing=True)
    db.query(PaymentProof).filter(PaymentProof.kind == kind, PaymentProof.payment_id == payment_id).delete()
    db.commit()
    return None
