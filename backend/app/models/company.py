from sqlalchemy import Column, Integer, String, Float, Boolean
from app.core.database import Base


class HsnCode(Base):
    """HSN / SAC code with its GST rate. Services and papers point at one of these so tax is worked out per line."""

    __tablename__ = "hsn_codes"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, unique=True, index=True, nullable=False)
    description = Column(String, nullable=True)
    gst_rate = Column(Float, nullable=False, default=18.0)  # total GST % (split equally into CGST + SGST)
    is_active = Column(Boolean, default=True)


class CompanySettings(Base):
    """The shop's own details, printed on every bill. One row (id = 1)."""

    __tablename__ = "company_settings"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False, default="Sri Jayam Printers")
    tagline = Column(String, nullable=True)
    gstin = Column(String, nullable=True)
    state_code = Column(String, nullable=True, default="33")  # first two digits of the GSTIN (33 = Tamil Nadu)
    address = Column(String, nullable=True)
    phones = Column(String, nullable=True)  # as printed, e.g. "99621 83355 / 99411 66664"
    landline = Column(String, nullable=True)
    email = Column(String, nullable=True)
    bank_name = Column(String, nullable=True)
    bank_branch = Column(String, nullable=True)
    bank_account_name = Column(String, nullable=True)
    bank_account_no = Column(String, nullable=True)
    bank_ifsc = Column(String, nullable=True)
    show_bank_on_invoice = Column(Boolean, default=True)
    # Next serial numbers, so the software continues the pre-printed bill books.
    next_gst_invoice_no = Column(Integer, nullable=False, default=1)
    next_cash_bill_no = Column(Integer, nullable=False, default=1)
    next_challan_no = Column(Integer, nullable=False, default=1)
