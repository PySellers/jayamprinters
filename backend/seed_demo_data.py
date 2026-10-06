"""
Seeds realistic-looking demo data for a client walkthrough: customers,
quotations/job-cards/invoices in a mix of statuses, a couple of vendors +
purchases + inventory items (one deliberately low-stock), and a few cash
ledger entries. Uses the same service functions the app itself calls
(create_quotation, convert_quotation_to_job_cards, create_invoice_from_quotation,
record_payment) so totals/tax/status transitions are computed exactly the way
a real bill would be -- this isn't hand-rolled fake numbers.

Only uses products that already have real (non-zero) pricing entered
-- Xerox/Photocopy and Rubber Stamp -- so the demo shows real computed
totals, not the ₹0 placeholders most of the rest of the catalog still has.

Not idempotent by design (re-running adds another round of demo data) --
intended to be run once against a freshly deployed environment.

Usage:
    cd backend && venv\\Scripts\\activate && python seed_demo_data.py
"""

from datetime import date, timedelta

from app.core.database import SessionLocal
from app.models.customer import Customer
from app.models.product import Product
from app.models.attribute import Attribute, AttributeOption
from app.models.job_card import JobCardStatus
from app.models.purchase import Vendor, InventoryItem, Purchase, PurchaseItem, PurchasePayment, PurchaseStatus
from app.models.cash_ledger import CashTransaction, CashTxnType, ChequeTransaction, ChequeDirection, ChequeStatus
from app.schemas.quotation import QuotationCreate, QuotationItemCreate, SelectedOptionIn
from app.schemas.invoice import PaymentCreate
from app.models.invoice import PaymentMethod
from app.services.quotation_service import create_quotation
from app.services.job_card_service import convert_quotation_to_job_cards
from app.services.invoice_service import create_invoice_from_quotation, record_payment

db = SessionLocal()


def opt(category_product_name, attr_name, option_value):
    product = db.query(Product).filter_by(name=category_product_name).first()
    attr = db.query(Attribute).filter_by(category_id=product.category_id, name=attr_name).first()
    option = db.query(AttributeOption).filter_by(attribute_id=attr.id, value=option_value).first()
    return SelectedOptionIn(attribute_id=attr.id, attribute_option_id=option.id)


def main():
    print("Seeding demo customers...")
    customer_defs = [
        ("Ravi Kumar", "9876543210", None, None),
        ("Priya Traders", "9123456789", "priya.traders@example.com", "33AAAAA0000A1Z5"),
        ("Anand Stationery Mart", "9988776655", None, "33BBBBB1111B2Z6"),
        ("Lakshmi Enterprises", "9012345678", "lakshmi.ent@example.com", None),
        ("Karthik S", "9345678901", None, None),
        ("Meena Fashions", "9765432109", "meena.fashions@example.com", None),
    ]
    customers = []
    for name, phone, email, gstin in customer_defs:
        c = Customer(name=name, phone=phone, email=email, gstin=gstin)
        db.add(c)
        db.flush()
        customers.append(c)
    db.commit()
    print(f"  {len(customers)} customers created")

    xerox = db.query(Product).filter_by(name="Xerox / Photocopy").first()
    stamp_a1 = db.query(Product).filter_by(name="Polymer Stamp A1 (25x8mm)").first()
    stamp_b2 = db.query(Product).filter_by(name="Polymer Stamp B2 (70x16mm)").first()

    print("Creating quotations / job cards / invoices...")

    def make_order(customer, items, convert=True, invoice=True, payment=None):
        q = create_quotation(db, QuotationCreate(customer_id=customer.id, items=items))
        if not convert:
            return q, None, None
        job_cards = convert_quotation_to_job_cards(db, q.id)
        if not invoice:
            return q, job_cards, None
        inv = create_invoice_from_quotation(db, q.id)
        if payment:
            inv = record_payment(db, inv.id, PaymentCreate(amount=payment, method=PaymentMethod.cash))
        return q, job_cards, inv

    # 1. Fully paid, delivered -- 200 A4 B&W double-side photocopies
    q1, jc1, inv1 = make_order(
        customers[0],
        [QuotationItemCreate(
            product_id=xerox.id, quantity=200,
            selected_options=[
                opt("Xerox / Photocopy", "Paper Size", "A4"),
                opt("Xerox / Photocopy", "Colour", "Black & White"),
                opt("Xerox / Photocopy", "Print Side", "Double Side"),
            ],
        )],
    )
    inv1 = record_payment(db, inv1.id, PaymentCreate(amount=inv1.grand_total, method=PaymentMethod.upi))
    for jc in jc1:
        jc.status = JobCardStatus.delivered
    db.commit()

    # 2. Partially paid, in progress (printing) -- 50 rubber stamps (Polymer A1)
    q2, jc2, inv2 = make_order(
        customers[1],
        [QuotationItemCreate(product_id=stamp_a1.id, quantity=50, selected_options=[])],
    )
    record_payment(db, inv2.id, PaymentCreate(amount=round(inv2.grand_total / 2, 2), method=PaymentMethod.cash))
    for jc in jc2:
        jc.status = JobCardStatus.printing
    db.commit()

    # 3. Unpaid, pending -- A3 colour single-side, small run
    q3, jc3, inv3 = make_order(
        customers[2],
        [QuotationItemCreate(
            product_id=xerox.id, quantity=30,
            selected_options=[
                opt("Xerox / Photocopy", "Paper Size", "A3"),
                opt("Xerox / Photocopy", "Colour", "Colour"),
                opt("Xerox / Photocopy", "Print Side", "Single Side"),
            ],
        )],
    )
    # jc3 stays "pending" (default)

    # 4. Unpaid, pending -- rubber stamp B2
    q4, jc4, inv4 = make_order(
        customers[3],
        [QuotationItemCreate(product_id=stamp_b2.id, quantity=20, selected_options=[])],
    )

    # 5. Fully paid, delivered -- mixed line items (xerox + stamps) for one customer
    q5, jc5, inv5 = make_order(
        customers[4],
        [
            QuotationItemCreate(
                product_id=xerox.id, quantity=100,
                selected_options=[
                    opt("Xerox / Photocopy", "Paper Size", "A4"),
                    opt("Xerox / Photocopy", "Colour", "Black & White"),
                    opt("Xerox / Photocopy", "Print Side", "Single Side"),
                ],
            ),
            QuotationItemCreate(product_id=stamp_a1.id, quantity=10, selected_options=[]),
        ],
    )
    inv5 = record_payment(db, inv5.id, PaymentCreate(amount=inv5.grand_total, method=PaymentMethod.card))
    for jc in jc5:
        jc.status = JobCardStatus.delivered
    db.commit()

    # 6. Draft quotation, not converted -- shows the Quotations list has a pending draft
    q6 = create_quotation(db, QuotationCreate(
        customer_id=customers[5].id,
        items=[QuotationItemCreate(product_id=stamp_b2.id, quantity=15, selected_options=[])],
    ))

    print("  5 orders (invoiced) + 1 draft quotation created")

    print("Seeding vendors, inventory, and a purchase...")
    vendor1 = Vendor(name="ABC Paper Suppliers", phone="9000011111", gstin="33CCCCC2222C3Z7")
    vendor2 = Vendor(name="XYZ Ink & Toner", phone="9000022222")
    db.add_all([vendor1, vendor2])
    db.flush()

    paper = InventoryItem(name="A4 Paper Ream", unit="reams", current_qty=180, reorder_threshold=50)
    ink = InventoryItem(name="Toner Cartridge (Black)", unit="pcs", current_qty=3, reorder_threshold=5)  # deliberately low
    rubber = InventoryItem(name="Rubber Stamp Blank Sheet", unit="sheets", current_qty=40, reorder_threshold=20)
    db.add_all([paper, ink, rubber])
    db.flush()

    purchase = Purchase(purchase_number="PUR-DEMO-001", vendor_id=vendor1.id, total_amount=0)
    db.add(purchase)
    db.flush()
    pitem = PurchaseItem(purchase_id=purchase.id, inventory_item_id=paper.id, quantity=100, unit_price=220, total_price=22000)
    db.add(pitem)
    paper.current_qty += 100
    purchase.total_amount = 22000
    db.flush()
    db.add(PurchasePayment(purchase_id=purchase.id, amount=15000, method=PaymentMethod.bank_transfer))
    purchase.paid_amount = 15000
    purchase.status = PurchaseStatus.partially_paid
    db.commit()
    print("  2 vendors, 3 inventory items (1 low-stock), 1 purchase created")

    print("Seeding cash ledger entries...")
    # A realistic day's cash position, not tied to any one invoice's total --
    # cash_in_hand = receipts - payments - bank_deposits must stay positive,
    # same as a real till.
    db.add_all([
        CashTransaction(txn_type=CashTxnType.receipt, amount=8500, note="Daily counter cash collections", created_by="Admin User"),
        CashTransaction(txn_type=CashTxnType.payment, amount=1200, note="Electricity bill", created_by="Admin User"),
        CashTransaction(txn_type=CashTxnType.bank_deposit, amount=5000, note="Weekly deposit", created_by="Admin User"),
    ])
    db.add(ChequeTransaction(
        direction=ChequeDirection.deposited, cheque_no="000452", amount=8000,
        party_name="Priya Traders", status=ChequeStatus.pending,
        cheque_date=date.today() - timedelta(days=2),
    ))
    db.commit()
    print("  3 cash transactions + 1 cheque created")

    print("\nDemo data seeded successfully.")


if __name__ == "__main__":
    main()
