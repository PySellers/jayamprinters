"""
UAT / demo data for Sri Jayam ERP -- realistic Chennai customers, an order for EVERY service
(all 14), real quotations in each status, job cards in every production stage, GST and non-GST
invoices with paid / part-paid / unpaid balances, delivery challans, vendors, stock (some low),
purchases, cash ledger entries, cheques and staff logins for each role.

Every order is created through the same service functions the screens use, so prices, tax,
invoices and job cards are computed exactly as in real use. For each order an independent
recomputation from the raw rate tables is compared with the invoice, and an EVIDENCE line is
printed (used to build the UAT test report).

Everything is tagged ("UAT demo" on customers, "[UAT]" on ledger notes, demo user e-mails) so it can
be wiped before real client data goes in:

    python seed_uat_demo_data.py            # add the demo data (skips if already present)
    python seed_uat_demo_data.py --remove   # delete everything this script created

Usage:
    cd backend && venv\\Scripts\\activate && python seed_uat_demo_data.py
"""

import json
import sys
from datetime import date, datetime, timedelta

from app.core.database import SessionLocal
from app.models.customer import Customer
from app.models.delivery_challan import DeliveryChallan
from app.models.cash_ledger import CashTransaction, CashTxnType, ChequeDirection, ChequeStatus, ChequeTransaction
from app.models.extra_charge import ChargeType, ExtraCharge
from app.models.attribute import Attribute, AttributeOption
from app.models.invoice import Invoice, PaymentMethod
from app.models.job_card import JobCard, JobCardPriority, JobCardStatus
from app.models.masters import Machine, PrintingType, Tax
from app.models.price_matrix import PriceMatrixCell
from app.models.product import Product, ProductCategory
from app.models.purchase import InventoryItem, Purchase, Vendor
from app.models.quantity_slab import QuantitySlab
from app.models.quotation import Quotation, QuotationStatus
from app.models.user import User, UserRole
from app.schemas.delivery_challan import ChallanItem, DeliveryChallanCreate
from app.schemas.invoice import PaymentCreate
from app.schemas.purchase import PurchaseCreate, PurchaseItemIn, PurchasePaymentCreate
from app.schemas.quotation import QuotationCreate, QuotationItemCreate, SelectedOptionIn
from app.services import delivery_challan_service
from app.services.auth_service import get_password_hash
from app.services.invoice_service import create_invoice_from_quotation, record_payment
from app.services.job_card_service import convert_quotation_to_job_cards
from app.services.purchase_service import create_purchase, record_purchase_payment
from app.services.quotation_service import create_quotation

MARK = "UAT demo"
DEMO_PASSWORD = "Uat@12345"
db = SessionLocal()
TODAY = date.today()

# ----------------------------------------------------------------------------- master data
MACHINES = ["Heidelberg Offset (4-colour)", "Konica Minolta Digital Press", "Xerox Copier A3", "Large Format Plotter",
            "Flex Printing Machine", "Polymer Stamp Unit", "Creasing & Cutting Machine", "Binding Section"]
PRINTING_TYPES = ["Offset", "Digital", "Screen", "Flex", "Xerox / Laser"]
EXTRA_TAXES = [("GST 5%", 5.0), ("GST 12%", 12.0), ("GST 28%", 28.0)]
STAFF = [  # name, email, role
    ("Priya (Counter)", "counter@srijayam.com", UserRole.counter),
    ("Karthik (Designer)", "designer@srijayam.com", UserRole.production),
    ("Murugan (Operator)", "operator@srijayam.com", UserRole.production),
    ("Lakshmi (Accounts)", "accounts@srijayam.com", UserRole.accounts),
]
CUSTOMERS = [  # name, billing person, phone, email, gstin, address
    ("Sri Murugan Traders", "Murugan S", "9000010001", "murugan.traders@example.com", "33ABCDE1234F1Z5", "12, Usman Road, T. Nagar, Chennai 600017"),
    ("Chennai Public School", "Mrs. Revathi", "9000010002", "office@chennaipublicschool.example.com", "33AACCC5678K1Z2", "45, 2nd Avenue, Anna Nagar, Chennai 600040"),
    ("Annai Textiles", "Selvam", "9000010003", "annai.textiles@example.com", "33AAAPA1111M1Z9", "88, Pondy Bazaar, T. Nagar, Chennai 600017"),
    ("Vetri Hospital", "Admin Office", "9000010004", "admin@vetrihospital.example.com", "33AABCV2222H1ZP", "3, GST Road, Tambaram, Chennai 600045"),
    ("Sunrise Caterers", "Mr. Rajesh", "9000010005", "sunrise.caterers@example.com", None, "21, Mount Road, Guindy, Chennai 600032"),
    ("Kaveri Silks", "Mrs. Kaveri", "9000010006", "kaveri.silks@example.com", "33AAEFK3333D1Z7", "7, Mylapore Tank Street, Chennai 600004"),
    ("Bharath Engineering Works", "Bharath Kumar", "9000010007", "bharath.eng@example.com", "33AAGFB4444L1Z1", "Plot 14, SIDCO Industrial Estate, Ambattur, Chennai 600098"),
    ("St. Joseph College", "Fr. Antony", "9000010008", "accounts@stjosephcollege.example.com", "33AAATS5555Q1Z6", "100, Velachery Main Road, Chennai 600042"),
    ("Anbu Jewellers", "Anbu Raj", "9000010009", "anbu.jewellers@example.com", "33AAHFA6666P1Z3", "5, Kodambakkam High Road, Chennai 600024"),
    ("Greenleaf Restaurant", "Manager", "9000010010", "greenleaf.resto@example.com", "33AAJFG7777R1Z8", "19, Adyar Gate, Adyar, Chennai 600020"),
    ("Dr. Ramesh Clinic", "Dr. Ramesh", "9000010011", "dr.ramesh.clinic@example.com", None, "2, Perambur High Road, Chennai 600011"),
    ("Meenakshi Wedding Hall", "Mr. Subbu", "9000010012", "meenakshi.hall@example.com", None, "62, Porur Main Road, Chennai 600116"),
    ("Karthik Mobiles", "Karthik", "9000010013", "karthik.mobiles@example.com", None, "9, Medavakkam Road, Chennai 600100"),
    ("Walk-in Customer", "Ravi", "9000010014", None, None, "Chennai"),
]
VENDORS = [("Sri Balaji Paper Mart", "9000020001", "33AAKFS8888N1Z4"), ("Chennai Ink & Chemicals", "9000020002", "33AALFC9999J1Z2"),
           ("Vinayaga Binding Materials", "9000020003", None), ("Poly Plates & Stamps", "9000020004", "33AAMFP1010G1Z5"),
           ("Digital Media Suppliers", "9000020005", "33AANFD2020E1Z1")]
INVENTORY = [  # name, unit, qty, reorder threshold
    ("A4 Paper 70 GSM (ream)", "reams", 120, 40), ("A4 Paper 80 GSM (ream)", "reams", 85, 30), ("A3 Paper 70 GSM (ream)", "reams", 12, 20),
    ("Art Board 300 GSM (sheets)", "sheets", 600, 200), ("NCR Paper Sets (reams)", "reams", 6, 10), ("Offset Ink - Black (kg)", "kg", 14, 5),
    ("Offset Ink - Cyan/Magenta/Yellow (kg)", "kg", 9, 6), ("Toner - Black", "pcs", 3, 4), ("Aluminium Printing Plates", "pcs", 90, 40),
    ("Spiral Binding Coils (box)", "boxes", 25, 10), ("Wiro Rings (box)", "boxes", 8, 10), ("Flex Roll (sq ft)", "sqft", 1800, 500),
    ("Blank PVC Cards", "pcs", 900, 300), ("Polymer Stamp Blanks", "pcs", 150, 50), ("Lamination Film Roll", "rolls", 7, 3), ("Foil Roll - Gold", "rolls", 2, 3),
]


def d_ago(n):
    return datetime.combine(TODAY - timedelta(days=n), datetime.min.time()) + timedelta(hours=11)


# ----------------------------------------------------------------------------- lookups
def cat(name):
    return db.query(ProductCategory).filter_by(name=name).one()


def prod(c, name):
    return db.query(Product).filter_by(category_id=c.id, name=name).one()


def opt(c, attr, value):
    a = db.query(Attribute).filter_by(category_id=c.id, name=attr).one()
    o = db.query(AttributeOption).filter_by(attribute_id=a.id, value=value).one()
    return SelectedOptionIn(attribute_id=a.id, attribute_option_id=o.id)


def chg(c, name):
    return db.query(ExtraCharge).filter_by(category_id=c.id, name=name, is_active=True).one().id


def customer(name):
    return db.query(Customer).filter_by(name=name, reason=MARK).one()


def user(email):
    return db.query(User).filter_by(email=email).one()


# ----------------------------------------------------------------------------- independent price recomputation
def expected_line(c, product, qty, options, charge_names, sets=1, area=None):
    """Recompute a line from the raw rate tables, without calling the pricing service."""
    opt_rows = []
    for attr, value in options:
        a = db.query(Attribute).filter_by(category_id=c.id, name=attr).one()
        o = db.query(AttributeOption).filter_by(attribute_id=a.id, value=value).one()
        opt_rows.append((a, o))
    if product.pricing_type.value == "fixed":
        base = product.fixed_price
    else:
        matrix = {(a.id, o.id) for a, o in opt_rows if a.in_price_matrix}

        def cell_price(q):
            for cell in db.query(PriceMatrixCell).filter_by(product_id=product.id, is_active=True):
                s = db.query(QuantitySlab).get(cell.quantity_slab_id)
                if s.min_quantity <= q and (s.max_quantity is None or s.max_quantity >= q):
                    if {(o.attribute_id, o.attribute_option_id) for o in cell.options} == matrix:
                        return cell.unit_price, s
            raise LookupError("no cell")
        price, slab = cell_price(qty)
        if product.pricing_type.value == "per_area":
            base = price * (area or 0)
        elif slab.is_incremental:
            total = 0.0
            for s in db.query(QuantitySlab).filter_by(category_id=c.id, is_incremental=True).order_by(QuantitySlab.min_quantity):
                if s.min_quantity > qty:
                    break
                upper = qty if s.max_quantity is None else min(qty, s.max_quantity)
                total += (upper - s.min_quantity + 1) * cell_price(s.min_quantity)[0]
            base = total / qty
        else:
            base = price
        base += sum(o.extra_price for _, o in opt_rows)
    extra = 0.0
    for name in charge_names:
        ch = db.query(ExtraCharge).filter_by(category_id=c.id, name=name, is_active=True).one()
        t = ch.charge_type
        if t == ChargeType.per_unit:
            extra += ch.amount
        elif t == ChargeType.per_set:
            extra += ch.amount * sets / qty
        elif t == ChargeType.per_sqft:
            extra += ch.amount * (area or 0)
        elif t == ChargeType.flat:
            extra += ch.amount / qty
        elif t == ChargeType.percentage:
            extra += base * ch.amount / 100
    unit = base + extra
    if c.min_charge and unit * qty < c.min_charge:
        unit = c.min_charge / qty
    return round(unit * qty, 2)


# ----------------------------------------------------------------------------- scenarios
BB, XX = "Bill Books & Stationery", "Xerox / Photocopy"


def bill_book(size, gsm, doc, copies, bill, bind, model, sett, qty, colours, notes_extra="", paper="Excel Bond", side="Front Back"):
    opts = [("Document Type", doc), ("Paper/GSM Type", gsm), ("Copies per Set", copies), ("Paper Name", paper), ("Print Side", side)]
    charges = [bill, bind, model, sett]
    coloured = [c for c in colours if c not in ("White", "Rough")]
    if coloured:
        charges.append(f"Coloured Layers - {len(coloured)} Layer{'s' if len(coloured) > 1 else ''}")
    layers = ["Original", "Duplicate", "Triplicate", "Quadruplicate", "Quintuplicate", "Sextuplicate", "Septuplicate"]
    notes = f"Copies {copies} ({', '.join(f'{layers[i]}: {c}' for i, c in enumerate(colours))}) | Printing colour: Black{notes_extra}"
    return dict(service=BB, product=f"Sheet Printing - {size}", opts=opts, charges=[c for c in charges if c], qty=qty, notes=notes)


def xerox(size, colour, side, pages, sets, charges=(), prod_name="Xerox / Photocopy"):
    return dict(service=XX, product=prod_name, opts=[("Paper Size", size), ("Colour", colour), ("Print Side", side)] if prod_name != "Passport Size Photo Copy" else [],
                charges=list(charges), qty=pages * sets, sets=sets, notes=f"{pages} pages x {sets} set{'s' if sets > 1 else ''}")


def spec(service, product, opts, qty, charges=(), notes=None, sets=1, area=None):
    return dict(service=service, product=product, opts=opts, charges=list(charges), qty=qty, notes=notes, sets=sets, area=area)


# key, customer, line spec, gst, kind, days_ago, delivery_in, payments, job status, priority, machine, challan
ORDERS = [
    # ---- Bill Books & Stationery ----
    ("BB-01", "Sri Murugan Traders", bill_book("1/4", "80 GSM", "Bill Book", "1+3", "Bill Type - Two Bill (NCR)", "Binding - Pad", "Binding Model - Side Binding", "Binding Set - 50 Set (1+3)", 1000, ["White", "Pink", "Yellow", "Green"]),
     True, "order", 20, -12, [("upi", 1.0)], "delivered", "medium", "Heidelberg Offset (4-colour)", True),
    ("BB-02", "Anbu Jewellers", bill_book("1/8", "70 GSM", "Cash Memo", "1+1", "Bill Type - Single Bill", "Binding - Pad", "Binding Model - Top Binding", "Binding Set - 100 Set (1+1)", 500, ["White", "Yellow"]),
     False, "order", 6, 2, [("cash", 1.0)], "printing", "high", "Heidelberg Offset (4-colour)", False),
    ("BB-03", "Bharath Engineering Works", bill_book("1/4", "100 GSM", "Delivery Challan", "1+2", "Bill Type - Three Bill (NCR)", "Binding - Hard Binding", "Binding Model - Side Binding", "Binding Set - 25 Set (1+2)", 2000, ["White", "Pink", "Yellow"], paper="Royal Ex.Bond"),
     True, "order", 9, 4, [("bank_transfer", 0.5)], "binding", "medium", "Binding Section", False),
    ("BB-04", "Dr. Ramesh Clinic", bill_book("1/6", "60 GSM", "Prescription", "1+1", "Bill Type - Single Bill", "Binding - Loose Sheet", None, None, 100, ["White"], side="Single Side"),
     False, "order", 3, 1, [], "design", "low", "Konica Minolta Digital Press", False),
    # ---- Xerox ----
    ("XX-01", "Chennai Public School", xerox("A4", "Black & White", "Double Side", 20, 5, ["Spiral Binding", "Transparent Front Sheet"]),
     False, "order", 14, -8, [("cash", 1.0)], "delivered", "medium", "Xerox Copier A3", True),
    ("XX-02", "St. Joseph College", xerox("A4", "Colour", "Single Side", 50, 2, ["Hard Binding", "Colour Card Front Sheet", "Paper GSM - 130 GSM"]),
     True, "order", 8, 3, [("upi", 0.6)], "packing", "high", "Konica Minolta Digital Press", False),
    ("XX-03", "Bharath Engineering Works", dict(service=XX, product="Xerox / Photocopy", opts=[("Paper Size", "A0"), ("Colour", "Black & White"), ("Print Side", "Single Side")], charges=[], qty=4, notes="Engineering drawings - 4 sheets"),
     False, "order", 2, 0, [("cash", 1.0)], "printing", "urgent", "Large Format Plotter", False),
    ("XX-04", "Walk-in Customer", xerox("A3", "Black & White", "Single Side", 100, 1, ["Lamination - A3 (per page)"]),
     False, "order", 1, 0, [("cash", 1.0)], "approval", "medium", "Xerox Copier A3", False),
    ("XX-05", "Karthik Mobiles", xerox("A4", "Black & White", "Single Side", 1, 8, prod_name="Passport Size Photo Copy"),
     False, "order", 1, 0, [("cash", 1.0)], "delivered", "low", "Xerox Copier A3", False),
    # ---- Visiting Card ----
    ("VC-01", "Anbu Jewellers", spec("Visiting Card", "Visiting Card", [("Finish/Lamination Type", "Gloss Lamination"), ("Side", "Front & Back")], 500, ["Designing Charge"]),
     True, "order", 12, -3, [("upi", 1.0)], "delivered", "medium", "Heidelberg Offset (4-colour)", True),
    ("VC-02", "Dr. Ramesh Clinic", spec("Visiting Card", "Visiting Card", [("Finish/Lamination Type", "Matt Lamination"), ("Side", "Single Side")], 1000),
     False, "order", 5, 2, [("cash", 0.5)], "printing", "medium", "Konica Minolta Digital Press", False),
    # ---- Invitation & Greeting Cards ----
    ("IN-01", "Meenakshi Wedding Hall", spec("Invitation & Greeting Cards", "Wedding Invitation - Offset", [("Paper/Board Type", "Art Board"), ("Side", "Both Side")], 500,
                                             ["Lamination - Matt", "Special Work - Gold Foiling", "Designing Charge"]),
     True, "order", 18, 6, [("bank_transfer", 0.5)], "approval", "high", "Heidelberg Offset (4-colour)", False),
    ("IN-02", "Kaveri Silks", spec("Invitation & Greeting Cards", "Multicolor Card", [("Paper/Board Type", "Art Paper"), ("Side", "Single Side")], 1000),
     False, "order", 4, 5, [], "design", "medium", "Heidelberg Offset (4-colour)", False),
    ("IN-03", "Sunrise Caterers", spec("Invitation & Greeting Cards", "Redymade Invitation", [("Side", "Single Side")], 300, ["Image/Sticker Pasting"]),
     False, "order", 7, 1, [("cash", 1.0)], "packing", "low", "Binding Section", False),
    # ---- Book Covers ----
    ("BC-01", "St. Joseph College", spec("Book Covers", "Cover - Offset", [("Paper/Board Type", "Art Board")], 500, ["Lamination - Glass"]),
     True, "order", 10, 3, [("upi", 1.0)], "binding", "medium", "Heidelberg Offset (4-colour)", False),
    ("BC-02", "Chennai Public School", spec("Book Covers", "Readymade Cover - Offset", [("Cover Size", "9x6")], 100),
     False, "order", 3, 2, [], "pending", "low", "Binding Section", False),
    # ---- Binding Services ----
    ("BS-01", "Chennai Public School", spec("Binding Services", "Project Binding", [("Binding Material", "Diamond Rexon")], 25, ["Binding Type - Hard Binding Corner"]),
     False, "order", 11, -2, [("cash", 1.0)], "delivered", "medium", "Binding Section", True),
    ("BS-02", "St. Joseph College", spec("Binding Services", "Wrapper Print", [("Wrapper Print Type", "Art Board Print - With Lamination")], 200),
     True, "order", 5, 4, [], "printing", "medium", "Heidelberg Offset (4-colour)", False),
    # ---- Register ----
    ("RG-01", "Annai Textiles", spec("Register", "Register", [("Size", "A4")], 200, ["Paper Name - Royal Ex.Bond", "Printing Color - 2 Color", "Binding Type - Side Binding", "Binding - Full Rexon"]),
     True, "order", 13, 0, [("bank_transfer", 1.0)], "packing", "medium", "Binding Section", False),
    # ---- Transfer Certificate ----
    ("TC-01", "Chennai Public School", spec("Transfer Certificate", "Transfer Certificate", [("Size", "A4"), ("Side", "Single Side")], 100, ["Paper Name - Excel Bond", "Binding - Soft Binding"]),
     False, "order", 16, -6, [("cash", 1.0)], "delivered", "medium", "Konica Minolta Digital Press", True),
    # ---- Application Form ----
    ("AF-01", "St. Joseph College", spec("Application Form", "Application Form", [("Paper/GSM Type", "Maplitho 80 GSM")], 300, ["Side - Both Side Printing", "Folding - Two Folding"]),
     True, "order", 9, 1, [("upi", 1.0)], "printing", "medium", "Konica Minolta Digital Press", False),
    # ---- ID Card ----
    ("ID-01", "Vetri Hospital", spec("ID Card", "PVC ID Card", [("Side", "Front & Back")], 120, ["Holder - Portrait", "Rope - Multi Color"]),
     True, "order", 15, 2, [("bank_transfer", 0.6)], "printing", "high", "Konica Minolta Digital Press", False),
    ("ID-02", "Bharath Engineering Works", spec("ID Card", "Chip Card", [("Side", "Front & Back")], 10),
     False, "order", 4, 7, [], "design", "low", "Konica Minolta Digital Press", False),
    ("ID-03", "Greenleaf Restaurant", spec("ID Card", "Temporary ID Card", [("Side", "Single Side")], 60, ["ID Sticker Only"]),
     False, "order", 2, 1, [("cash", 1.0)], "approval", "low", "Konica Minolta Digital Press", False),
    # ---- Rubber Stamp ----
    ("RS-01", "Dr. Ramesh Clinic", spec("Rubber Stamp", "Polymer Stamp A3 (50x8mm)", [], 5),
     False, "order", 3, 0, [("cash", 1.0)], "delivered", "medium", "Polymer Stamp Unit", False),
    ("RS-02", "Sri Murugan Traders", spec("Rubber Stamp", "Polymer Stamp A8 (60x12mm)", [], 2),
     True, "order", 1, 1, [], "printing", "medium", "Polymer Stamp Unit", False),
    # ---- Menu Card ----
    ("MC-01", "Greenleaf Restaurant", spec("Menu Card", "Menu Card", [("Paper/GSM Type", "Art Paper 250 GSM")], 100, ["Lamination - Matt", "Binding - Wiro Biding", "Designing Charge"]),
     True, "order", 7, 2, [("upi", 0.5)], "design", "high", "Konica Minolta Digital Press", False),
    # ---- Thamboola Bag ----
    ("TB-01", "Meenakshi Wedding Hall", spec("Thamboola Bag", "Thamboola Bag", [("Side", "Both Side")], 500, ["Cover Charge", "Printing Color"]),
     False, "order", 6, 5, [("cash", 0.4)], "pending", "medium", "Flex Printing Machine", False),
    # ---- Digital Banner ----
    ("DB-01", "Kaveri Silks", spec("Digital Banner", "Digital Banner", [("Media Type", "Flex")], 2, ["Front Light", "With Frame"], notes="8 ft x 4 ft shop-front banner", area=32.0),
     True, "order", 8, -1, [("upi", 1.0)], "delivered", "urgent", "Flex Printing Machine", True),
    ("DB-02", "Karthik Mobiles", spec("Digital Banner", "Digital Banner", [("Media Type", "Oneway Sticker")], 1, ["With Fittings"], notes="Window sticker 3 ft x 2 ft", area=6.0),
     False, "order", 2, 1, [], "design", "medium", "Large Format Plotter", False),
]
# a few more mixed orders for the reports
ORDERS += [
    ("BB-05", "Annai Textiles", bill_book("1/4", "80 GSM", "Invoice", "1+3", "Bill Type - Four Bill (NCR)", "Binding - Soft Binding", "Binding Model - Center Stitching", "Binding Set - 100 Set (1+3)", 3000, ["White", "Pink", "Yellow", "Green"]),
     True, "order", 25, -14, [("bank_transfer", 1.0)], "delivered", "medium", "Heidelberg Offset (4-colour)", True),
    ("VC-03", "Karthik Mobiles", spec("Visiting Card", "Visiting Card", [("Finish/Lamination Type", "Without Lamination"), ("Side", "Single Side")], 100),
     False, "order", 21, -17, [("cash", 1.0)], "delivered", "low", "Konica Minolta Digital Press", False),
    ("XX-06", "Annai Textiles", xerox("A4", "Colour", "Double Side", 10, 12, ["Wiro Binding"]),
     True, "order", 30, -22, [("upi", 1.0)], "delivered", "medium", "Konica Minolta Digital Press", True),
]
# real quotations (not converted): key, customer, spec, gst, status, days_ago
QUOTES = [
    ("QT-01", "Vetri Hospital", bill_book("1/6", "70 GSM", "Gate Pass", "1+1", "Bill Type - Two Bill (NCR)", "Binding - Pad", "Binding Model - Top Binding", "Binding Set - 50 Set (1+1)", 1500, ["White", "Pink"]), True, QuotationStatus.sent, 4),
    ("QT-02", "Sunrise Caterers", spec("Menu Card", "Menu Card", [("Paper/GSM Type", "Art Paper 300 GSM")], 250, ["Lamination - Glass"]), False, QuotationStatus.approved, 6),
    ("QT-03", "Greenleaf Restaurant", spec("Digital Banner", "Digital Banner", [("Media Type", "Star Flex")], 1, ["Back Light"], area=48.0), True, QuotationStatus.draft, 1),
    ("QT-04", "Kaveri Silks", spec("Invitation & Greeting Cards", "Color Board", [("Paper/Board Type", "Metallic Board"), ("Side", "Both Side")], 1000, ["Special Work - Emposing"]), True, QuotationStatus.rejected, 12),
]


# ----------------------------------------------------------------------------- build helpers
def line_item(sp):
    c = cat(sp["service"])
    p = prod(c, sp["product"])
    return c, p, QuotationItemCreate(
        product_id=p.id, quantity=sp["qty"], sets=sp.get("sets", 1), area_sqft=sp.get("area"),
        selected_options=[opt(c, a, v) for a, v in sp["opts"]], extra_charge_ids=[chg(c, n) for n in sp["charges"]],
        spec_notes=sp.get("notes"),
    )


def seed_masters():
    for name in MACHINES:
        if not db.query(Machine).filter_by(name=name).first():
            db.add(Machine(name=name, is_active=True))
    for name in PRINTING_TYPES:
        if not db.query(PrintingType).filter_by(name=name).first():
            db.add(PrintingType(name=name, is_active=True))
    for name, rate in EXTRA_TAXES:
        if not db.query(Tax).filter_by(name=name).first():
            db.add(Tax(name=name, rate_percent=rate, is_default=False, is_active=True))
    for name, email, role in STAFF:
        if not db.query(User).filter_by(email=email).first():
            db.add(User(name=name, email=email, hashed_password=get_password_hash(DEMO_PASSWORD), role=role, is_active=True))
    db.commit()


def seed_customers():
    for name, person, phone, email, gstin, addr in CUSTOMERS:
        db.add(Customer(name=name, billing_person_name=person, phone=phone, whatsapp_number=phone, email=email, gstin=gstin,
                        address=addr, reason=MARK, notes="Demo customer for UAT", created_at=d_ago(40)))
    db.commit()


def place_order(key, cust, sp, gst, kind, days_ago, delivery_in, payments, status, priority, machine_name, challan):
    c, p, item = line_item(sp)
    customer_row = customer(cust)
    q = create_quotation(db, QuotationCreate(
        customer_id=customer_row.id, with_gst=gst, is_order=True, items=[item],
        proof1_date=TODAY - timedelta(days=max(days_ago - 1, 0)), proof1_time="11:00",
        delivery_date=TODAY + timedelta(days=delivery_in), delivery_time="17:00"))
    q.created_at = d_ago(days_ago)
    db.commit()
    jobs = convert_quotation_to_job_cards(db, q.id)
    inv = create_invoice_from_quotation(db, q.id)
    inv.created_at = d_ago(days_ago)
    machine = db.query(Machine).filter_by(name=machine_name).first()
    for jc in jobs:
        jc.created_at = d_ago(days_ago)
        jc.status = JobCardStatus(status)
        jc.priority = JobCardPriority(priority)
        jc.machine_id = machine.id if machine else None
        jc.designer_id = user("designer@srijayam.com").id
        jc.operator_id = user("operator@srijayam.com").id
        jc.delivery_date = TODAY + timedelta(days=delivery_in)
    db.commit()
    for method, fraction in payments:
        amount = round(inv.grand_total * fraction, 2)
        inv = record_payment(db, inv.id, PaymentCreate(amount=amount, method=PaymentMethod(method)))
        for pay in inv.payments:
            if hasattr(pay, "created_at"):
                pay.created_at = d_ago(max(days_ago - 1, 0))
    db.commit()
    dc_no = None
    if challan and status == "delivered":
        draft = delivery_challan_service.get_draft(db, jobs[0].id)
        dc = delivery_challan_service.create_challan(db, DeliveryChallanCreate(
            job_card_id=jobs[0].id, challan_date=TODAY - timedelta(days=max(days_ago - 2, 0)), to_text=draft.get("to_text", ""),
            items=[ChallanItem(**i) if isinstance(i, dict) else i for i in draft.get("items", [])]))
        dc_no = dc.dc_number
    expected = expected_line(c, p, sp["qty"], sp["opts"], sp["charges"], sp.get("sets", 1), sp.get("area"))
    actual = round(inv.subtotal, 2)
    tax_rate = db.query(Tax).get(inv.tax_id).rate_percent if inv.tax_id else 0
    exp_grand = round(expected + (round(expected * tax_rate / 100, 2) if gst else 0), 2)
    ok = abs(expected - actual) <= 0.05 and abs(exp_grand - inv.grand_total) <= 0.05
    print("EVIDENCE|" + json.dumps(dict(
        key=key, service=sp["service"], item=sp["product"], customer=cust, selections="; ".join(f"{a}: {v}" for a, v in sp["opts"]),
        charges="; ".join(sp["charges"]), qty=sp["qty"], sets=sp.get("sets", 1), gst=gst, expected_subtotal=expected, actual_subtotal=actual,
        tax=round(inv.tax_amount, 2), grand_total=round(inv.grand_total, 2), expected_grand_total=exp_grand, invoice=inv.invoice_number,
        job_card=jobs[0].job_number, job_status=status, payment_status=inv.status.value, paid=round(inv.amount_paid or 0, 2),
        challan=dc_no, result="PASS" if ok else "FAIL")))
    if not ok:
        print(f"  !! MISMATCH {key}: expected {expected} / grand {exp_grand}, got {actual} / {inv.grand_total}")
    return ok


def place_quote(key, cust, sp, gst, status, days_ago):
    c, p, item = line_item(sp)
    q = create_quotation(db, QuotationCreate(customer_id=customer(cust).id, with_gst=gst, is_order=False, items=[item],
                                             delivery_date=TODAY + timedelta(days=7)))
    q.created_at = d_ago(days_ago)
    q.status = status
    db.commit()
    expected = expected_line(c, p, sp["qty"], sp["opts"], sp["charges"], sp.get("sets", 1), sp.get("area"))
    ok = abs(expected - q.total_amount) <= 0.05
    print("EVIDENCE|" + json.dumps(dict(
        key=key, service=sp["service"], item=sp["product"], customer=cust, selections="; ".join(f"{a}: {v}" for a, v in sp["opts"]),
        charges="; ".join(sp["charges"]), qty=sp["qty"], sets=sp.get("sets", 1), gst=gst, expected_subtotal=expected, actual_subtotal=round(q.total_amount, 2),
        tax=round(q.tax_amount, 2), grand_total=round(q.grand_total, 2), expected_grand_total=None, invoice=q.quotation_number, job_card=None,
        job_status=f"quotation {status.value}", payment_status=None, paid=None, challan=None, result="PASS" if ok else "FAIL")))
    return ok


def seed_stock_and_ledger():
    vendors = {}
    for name, phone, gstin in VENDORS:
        v = db.query(Vendor).filter_by(name=name).first() or Vendor(name=name, phone=phone, gstin=gstin, email=None, address="Chennai", is_active=True)
        db.add(v)
        vendors[name] = v
    db.flush()
    items = {}
    for name, unit, qty, threshold in INVENTORY:
        it = db.query(InventoryItem).filter_by(name=name).first() or InventoryItem(name=name, unit=unit, current_qty=qty, reorder_threshold=threshold, notes=MARK)
        db.add(it)
        items[name] = it
    db.commit()
    purchases = [  # vendor, [(item, qty, unit price)], days ago, payments
        ("Sri Balaji Paper Mart", [("A4 Paper 70 GSM (ream)", 60, 235.0), ("A4 Paper 80 GSM (ream)", 40, 275.0)], 20, [("bank_transfer", 1.0)]),
        ("Chennai Ink & Chemicals", [("Offset Ink - Black (kg)", 10, 420.0), ("Toner - Black", 4, 3200.0)], 14, [("upi", 0.5)]),
        ("Vinayaga Binding Materials", [("Spiral Binding Coils (box)", 20, 380.0), ("Wiro Rings (box)", 6, 450.0)], 9, []),
        ("Poly Plates & Stamps", [("Polymer Stamp Blanks", 100, 14.0), ("Aluminium Printing Plates", 60, 95.0)], 7, [("cash", 1.0)]),
        ("Digital Media Suppliers", [("Flex Roll (sq ft)", 1200, 6.5), ("Blank PVC Cards", 500, 5.5)], 5, [("bank_transfer", 0.6)]),
        ("Sri Balaji Paper Mart", [("Art Board 300 GSM (sheets)", 400, 12.0)], 2, []),
    ]
    for vendor, lines, days, pays in purchases:
        before = {n: items[n].current_qty for n, _, _ in lines}
        p = create_purchase(db, PurchaseCreate(vendor_id=vendors[vendor].id, purchase_date=TODAY - timedelta(days=days), notes=MARK,
                                               items=[PurchaseItemIn(inventory_item_id=items[n].id, quantity=q, unit_price=u) for n, q, u in lines]))
        p.created_at = d_ago(days)
        for method, fraction in pays:
            record_purchase_payment(db, p.id, PurchasePaymentCreate(amount=round(p.total_amount * fraction, 2), method=PaymentMethod(method), notes=MARK))
        db.commit()
    cash = [  # type, amount, note, days ago
        (CashTxnType.receipt, 8500, "Counter cash collections", 9), (CashTxnType.receipt, 6200, "Counter cash collections", 8),
        (CashTxnType.payment, 1450, "Electricity bill", 8), (CashTxnType.receipt, 9800, "Counter cash collections", 6),
        (CashTxnType.payment, 600, "Tea / refreshments", 5), (CashTxnType.bank_deposit, 15000, "Weekly bank deposit", 5),
        (CashTxnType.receipt, 7300, "Counter cash collections", 3), (CashTxnType.payment, 2200, "Courier and transport", 2),
        (CashTxnType.receipt, 4100, "Counter cash collections", 1),
    ]
    for t, amount, note, days in cash:
        db.add(CashTransaction(txn_type=t, amount=amount, note=f"[UAT] {note}", created_by="Lakshmi (Accounts)", created_at=d_ago(days)))
    cheques = [
        (ChequeDirection.deposited, "000451", 12000, "Sri Murugan Traders", ChequeStatus.cleared, 12), (ChequeDirection.deposited, "000452", 8000, "Annai Textiles", ChequeStatus.pending, 3),
        (ChequeDirection.deposited, "000453", 5500, "Karthik Mobiles", ChequeStatus.bounced, 10), (ChequeDirection.issued, "770101", 22000, "Sri Balaji Paper Mart", ChequeStatus.pending, 2),
    ]
    for direction, no, amount, party, status, days in cheques:
        db.add(ChequeTransaction(direction=direction, cheque_no=no, amount=amount, party_name=party, status=status, bank_branch="Indian Bank, T. Nagar",
                                 cheque_date=TODAY - timedelta(days=days), notes="[UAT] demo cheque", created_at=d_ago(days)))
    db.commit()


def remove_all():
    print("Removing UAT demo data...")
    demo_customers = [c.id for c in db.query(Customer).filter_by(reason=MARK)]
    for dc in db.query(DeliveryChallan).filter(DeliveryChallan.customer_id.in_(demo_customers)).all():
        db.delete(dc)
    db.commit()
    for inv in db.query(Invoice).filter(Invoice.customer_id.in_(demo_customers)).all():
        db.delete(inv)
    db.commit()
    for jc in db.query(JobCard).filter(JobCard.customer_id.in_(demo_customers)).all():
        db.delete(jc)
    db.commit()
    for q in db.query(Quotation).filter(Quotation.customer_id.in_(demo_customers)).all():
        db.delete(q)
    db.commit()
    for c in db.query(Customer).filter_by(reason=MARK).all():
        db.delete(c)
    for p in db.query(Purchase).filter_by(notes=MARK).all():
        db.delete(p)
    db.commit()
    for name, *_ in INVENTORY:
        it = db.query(InventoryItem).filter_by(name=name, notes=MARK).first()
        if it:
            db.delete(it)
    for name, *_ in VENDORS:
        v = db.query(Vendor).filter_by(name=name).first()
        if v:
            db.delete(v)
    for t in db.query(CashTransaction).filter(CashTransaction.note.like("[UAT]%")).all():
        db.delete(t)
    for t in db.query(ChequeTransaction).filter(ChequeTransaction.notes.like("[UAT]%")).all():
        db.delete(t)
    for _, email, _ in STAFF:
        u = db.query(User).filter_by(email=email).first()
        if u:
            db.delete(u)
    db.commit()
    print("Done.")


def main():
    if "--remove" in sys.argv:
        remove_all()
        return
    seed_masters()
    if db.query(Customer).filter_by(reason=MARK).count():
        print("UAT demo data already present -- nothing added (run with --remove first to rebuild).")
        return
    seed_customers()
    results = [place_order(*o) for o in ORDERS]
    results += [place_quote(*q) for q in QUOTES]
    seed_stock_and_ledger()
    print(f"\nUAT demo data created: {len(CUSTOMERS)} customers, {len(ORDERS)} orders (invoice + job card), {len(QUOTES)} quotations, "
          f"{len(VENDORS)} vendors, {len(INVENTORY)} stock items, 6 purchases, ledger entries, cheques, {len(STAFF)} staff logins.")
    print(f"Price checks: {sum(results)} of {len(results)} matched the independent recomputation.")
    print(f"Staff logins (password for all: {DEMO_PASSWORD}): " + ", ".join(e for _, e, _ in STAFF))


if __name__ == "__main__":
    main()
