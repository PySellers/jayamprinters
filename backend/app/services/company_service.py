"""The shop's own details (printed on every bill) and its bill serial series."""

from sqlalchemy.orm import Session

from app.models.company import CompanySettings

# Taken from the client's own pre-printed bills (GST invoice, cash bill, delivery challan).
DEFAULTS = dict(
    name="Sri Jayam Printers",
    tagline="Wedding Cards, Offset & Screen Print and Binding...",
    gstin="33AHQPJ2395E1Z9",
    state_code="33",
    address="D.R.G. Complex, Old Mahabalipuram Road, Navalur, Chennai - 600 130.",
    phones="9962183355 / 9962113355 / 9941166664",
    landline="044 43328010",
    email="srijayamprintscmyk@gmail.com",
    bank_name="Indian Bank",
    bank_branch="Siruseri Branch",
    bank_account_name="SRI JAYAM PRINTERS",
    bank_account_no="494755425",
    bank_ifsc="IDIB000S146",
    show_bank_on_invoice=True,
    next_gst_invoice_no=1,
    next_cash_bill_no=1,
    next_challan_no=1,
)


def get_company(db: Session, lock: bool = False) -> CompanySettings:
    """The single settings row, created with the client's details the first time it is needed."""
    query = db.query(CompanySettings).filter(CompanySettings.id == 1)
    if lock:
        query = query.with_for_update()
    row = query.first()
    if row is None:
        row = CompanySettings(id=1, **DEFAULTS)
        db.add(row)
        db.flush()
    return row


def take_bill_number(db: Session, with_gst: bool) -> int:
    """Hands out the next serial of the GST-invoice or cash-bill series (the shop numbers them separately)."""
    company = get_company(db, lock=True)
    if with_gst:
        number = company.next_gst_invoice_no
        company.next_gst_invoice_no = number + 1
    else:
        number = company.next_cash_bill_no
        company.next_cash_bill_no = number + 1
    return number
