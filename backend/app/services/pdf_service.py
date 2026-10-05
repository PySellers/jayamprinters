from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_RIGHT, TA_CENTER

from app.models.invoice import Invoice
from app.models.customer import Customer
from app.models.product import Product

BRAND_COLOR = colors.HexColor("#1a237e")

# Common thermal POS roll widths. Printable area is narrower than the roll
# itself (typically ~4mm margin per side on 58mm/80mm rolls) -- most drivers
# handle that automatically, so we size the PDF to the full roll width and
# rely on small page margins below rather than guessing the printer's own
# hardware margin.
THERMAL_WIDTHS_MM = {"thermal_58": 58.0, "thermal_80": 80.0}

_ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
         "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"]
_TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]


def _two_digit_words(n: int) -> str:
    if n < 20:
        return _ONES[n]
    tens, ones = divmod(n, 10)
    return f"{_TENS[tens]} {_ONES[ones]}".strip()


def _three_digit_words(n: int) -> str:
    hundreds, rest = divmod(n, 100)
    parts = []
    if hundreds:
        parts.append(f"{_ONES[hundreds]} Hundred")
    if rest:
        parts.append(_two_digit_words(rest))
    return " ".join(parts)


def amount_in_words(amount: float) -> str:
    """Indian-numbering (lakh/crore) amount-in-words, e.g. 'Rupees Twelve Thousand Three
    Hundred and Fifty Only' -- the standard footer line on Indian invoices."""
    rupees = int(amount)
    paise = round((amount - rupees) * 100)

    if rupees == 0:
        rupee_words = "Zero"
    else:
        crore, rupees = divmod(rupees, 10_000_000)
        lakh, rupees = divmod(rupees, 100_000)
        thousand, rupees = divmod(rupees, 1000)
        hundred = rupees

        segments = []
        if crore:
            segments.append(f"{_three_digit_words(crore)} Crore")
        if lakh:
            segments.append(f"{_three_digit_words(lakh)} Lakh")
        if thousand:
            segments.append(f"{_three_digit_words(thousand)} Thousand")
        if hundred:
            segments.append(_three_digit_words(hundred))
        rupee_words = " ".join(segments)

    words = f"Rupees {rupee_words}"
    if paise:
        words += f" and {_two_digit_words(paise)} Paise"
    return words + " Only"


def generate_invoice_pdf(invoice: Invoice, customer: Customer, products_by_id: dict[int, Product]) -> bytes:
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        topMargin=20 * mm, bottomMargin=20 * mm, leftMargin=20 * mm, rightMargin=20 * mm,
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("TitleBrand", parent=styles["Title"], textColor=BRAND_COLOR, fontSize=20)
    right_style = ParagraphStyle("Right", parent=styles["Normal"], alignment=TA_RIGHT)
    bold_style = ParagraphStyle("Bold", parent=styles["Normal"], fontName="Helvetica-Bold")

    elements = []

    elements.append(Paragraph("Sri Jayam Printers", title_style))
    elements.append(Paragraph("ERP System", styles["Normal"]))
    elements.append(Spacer(1, 10 * mm))

    header_data = [
        [Paragraph(f"<b>Invoice #:</b> {invoice.invoice_number}", styles["Normal"]),
         Paragraph(f"<b>Date:</b> {invoice.invoice_date.strftime('%d %b %Y')}", right_style)],
        [Paragraph(f"<b>Bill To:</b> {customer.name}", styles["Normal"]),
         Paragraph(f"<b>Status:</b> {invoice.status.value.replace('_', ' ').title()}", right_style)],
        [Paragraph(f"Phone: {customer.phone}", styles["Normal"]), ""],
    ]
    if customer.address:
        header_data.append([Paragraph(f"Address: {customer.address}", styles["Normal"]), ""])
    if customer.gstin:
        header_data.append([Paragraph(f"GSTIN: {customer.gstin}", styles["Normal"]), ""])

    header_table = Table(header_data, colWidths=[100 * mm, 60 * mm])
    header_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    elements.append(header_table)
    elements.append(Spacer(1, 8 * mm))

    item_rows = [["Product", "Qty", "Unit Price", "Total"]]
    for item in invoice.items:
        product = products_by_id.get(item.product_id)
        product_name = product.name if product else f"Product #{item.product_id}"
        item_rows.append([
            product_name,
            str(item.quantity),
            f"Rs. {item.unit_price:.2f}",
            f"Rs. {item.total_price:.2f}",
        ])

    items_table = Table(item_rows, colWidths=[80 * mm, 25 * mm, 30 * mm, 30 * mm])
    items_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BRAND_COLOR),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("ALIGN", (0, 0), (0, -1), "LEFT"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f5f5f5")]),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    elements.append(items_table)
    elements.append(Spacer(1, 6 * mm))

    totals_data = [
        ["Subtotal", f"Rs. {invoice.subtotal:.2f}"],
        ["Tax", f"Rs. {invoice.tax_amount:.2f}"],
        ["Paid", f"Rs. {invoice.amount_paid:.2f}"],
        ["Balance", f"Rs. {invoice.grand_total - invoice.amount_paid:.2f}"],
    ]
    totals_table = Table(totals_data, colWidths=[135 * mm, 30 * mm])
    totals_table.setStyle(TableStyle([
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    elements.append(totals_table)
    elements.append(Spacer(1, 3 * mm))

    grand_total_style = ParagraphStyle("GrandTotalLabel", parent=styles["Normal"], fontName="Helvetica-Bold",
                                        fontSize=14, textColor=colors.white)
    grand_total_value_style = ParagraphStyle("GrandTotalValue", parent=right_style, fontName="Helvetica-Bold",
                                              fontSize=18, textColor=colors.white)
    grand_total_table = Table(
        [[Paragraph("GRAND TOTAL", grand_total_style), Paragraph(f"Rs. {invoice.grand_total:.2f}", grand_total_value_style)]],
        colWidths=[135 * mm, 30 * mm],
    )
    grand_total_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), BRAND_COLOR),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (0, 0), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    elements.append(grand_total_table)
    elements.append(Spacer(1, 4 * mm))
    elements.append(Paragraph(f"<i>{amount_in_words(invoice.grand_total)}</i>", styles["Normal"]))

    if invoice.payments:
        elements.append(Spacer(1, 8 * mm))
        elements.append(Paragraph("Payment History", bold_style))
        elements.append(Spacer(1, 2 * mm))
        payment_rows = [["Date", "Method", "Reference", "Amount"]]
        for payment in invoice.payments:
            payment_rows.append([
                payment.payment_date.strftime("%d %b %Y"),
                payment.method.value.replace("_", " ").title(),
                payment.reference_number or "-",
                f"Rs. {payment.amount:.2f}",
            ])
        payment_table = Table(payment_rows, colWidths=[35 * mm, 40 * mm, 55 * mm, 35 * mm])
        payment_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e8eaf6")),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("ALIGN", (3, 0), (3, -1), "RIGHT"),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        elements.append(payment_table)

    if invoice.notes:
        elements.append(Spacer(1, 8 * mm))
        elements.append(Paragraph(f"<b>Notes:</b> {invoice.notes}", styles["Normal"]))

    elements.append(Spacer(1, 14 * mm))
    footer_style = ParagraphStyle("Footer", parent=styles["Normal"], fontSize=9, textColor=colors.grey)
    footer_table = Table(
        [["Thank you for your business!", Paragraph("Authorised Signatory", right_style)]],
        colWidths=[100 * mm, 60 * mm],
    )
    footer_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
        ("LINEABOVE", (1, 0), (1, 0), 0.5, colors.grey),
        ("TOPPADDING", (1, 0), (1, 0), 10),
    ]))
    elements.append(footer_table)
    elements.append(Spacer(1, 3 * mm))
    elements.append(Paragraph("This is a computer-generated invoice.", footer_style))

    doc.build(elements)
    return buffer.getvalue()


def generate_invoice_thermal_pdf(
    invoice: Invoice,
    customer: Customer,
    products_by_id: dict[int, Product],
    roll_width_mm: float = 80.0,
) -> bytes:
    """Compact single-column receipt for small bill/POS thermal printers
    (58mm or 80mm roll width), as an alternative to the full A4 layout.

    The page HEIGHT is computed from actual content (header + one row per
    item/payment + totals + footer) rather than fixed, so a short bill
    doesn't print several extra inches of blank roll -- most thermal-printer
    drivers accept a variable-length "continuous roll" page size and cut
    right after the content, same as real POS software.
    """
    buffer = BytesIO()

    item_count = len(invoice.items)
    payment_count = len(invoice.payments)
    est_height_mm = 62 + item_count * 7 + (10 + payment_count * 6 if payment_count else 0) + (8 if invoice.notes else 0)
    page_size = (roll_width_mm * mm, max(est_height_mm, 90) * mm)

    margin = 3 * mm
    doc = SimpleDocTemplate(
        buffer, pagesize=page_size,
        topMargin=margin, bottomMargin=margin, leftMargin=margin, rightMargin=margin,
    )

    styles = getSampleStyleSheet()
    center_style = ParagraphStyle("Center", parent=styles["Normal"], alignment=TA_CENTER, fontSize=8, leading=10)
    center_bold = ParagraphStyle("CenterBold", parent=center_style, fontName="Helvetica-Bold", fontSize=10)
    small = ParagraphStyle("Small", parent=styles["Normal"], fontSize=7.5, leading=9.5)
    small_right = ParagraphStyle("SmallRight", parent=small, alignment=TA_RIGHT)
    small_bold = ParagraphStyle("SmallBold", parent=small, fontName="Helvetica-Bold")
    small_bold_right = ParagraphStyle("SmallBoldRight", parent=small_right, fontName="Helvetica-Bold")

    content_width = roll_width_mm * mm - 2 * margin
    elements = []

    elements.append(Paragraph("SRI JAYAM PRINTERS", center_bold))
    elements.append(Paragraph("Multi-Service Printing", center_style))
    elements.append(Spacer(1, 2 * mm))
    elements.append(Paragraph(f"Invoice: {invoice.invoice_number}", small))
    elements.append(Paragraph(f"Date: {invoice.invoice_date.strftime('%d-%b-%Y')}", small))
    elements.append(Paragraph(f"Customer: {customer.name}", small))
    if customer.phone:
        elements.append(Paragraph(f"Ph: {customer.phone}", small))
    elements.append(Spacer(1, 1.5 * mm))

    dash = "-" * 32
    elements.append(Paragraph(dash, small))

    name_col = content_width * 0.5
    qty_col = content_width * 0.14
    price_col = content_width * 0.18
    total_col = content_width - name_col - qty_col - price_col

    item_rows = [[
        Paragraph("Item", small_bold), Paragraph("Qty", small_bold_right),
        Paragraph("Rate", small_bold_right), Paragraph("Amt", small_bold_right),
    ]]
    for item in invoice.items:
        product = products_by_id.get(item.product_id)
        name = product.name if product else f"#{item.product_id}"
        item_rows.append([
            Paragraph(name, small), Paragraph(str(item.quantity), small_right),
            Paragraph(f"{item.unit_price:.2f}", small_right), Paragraph(f"{item.total_price:.2f}", small_right),
        ])
    items_table = Table(item_rows, colWidths=[name_col, qty_col, price_col, total_col])
    items_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 1),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
        ("LINEBELOW", (0, 0), (-1, 0), 0.5, colors.black),
    ]))
    elements.append(items_table)
    elements.append(Paragraph(dash, small))

    totals_rows = [
        ["Subtotal", f"Rs.{invoice.subtotal:.2f}"],
        ["Tax", f"Rs.{invoice.tax_amount:.2f}"],
        ["GRAND TOTAL", f"Rs.{invoice.grand_total:.2f}"],
        ["Paid", f"Rs.{invoice.amount_paid:.2f}"],
        ["Balance", f"Rs.{invoice.grand_total - invoice.amount_paid:.2f}"],
    ]
    totals_table = Table(
        [[Paragraph(l, small_bold if l == "GRAND TOTAL" else small),
          Paragraph(v, small_bold_right if l == "GRAND TOTAL" else small_right)] for l, v in totals_rows],
        colWidths=[content_width * 0.6, content_width * 0.4],
    )
    totals_table.setStyle(TableStyle([("TOPPADDING", (0, 0), (-1, -1), 1), ("BOTTOMPADDING", (0, 0), (-1, -1), 1)]))
    elements.append(totals_table)

    if invoice.payments:
        elements.append(Paragraph(dash, small))
        elements.append(Paragraph("Payments", small_bold))
        for payment in invoice.payments:
            method = payment.method.value.replace("_", " ").title()
            elements.append(Paragraph(
                f"{payment.payment_date.strftime('%d-%b')} {method}: Rs.{payment.amount:.2f}", small,
            ))

    if invoice.notes:
        elements.append(Paragraph(dash, small))
        elements.append(Paragraph(invoice.notes, small))

    elements.append(Spacer(1, 2 * mm))
    elements.append(Paragraph(dash, small))
    elements.append(Paragraph("Thank you! Visit again.", center_style))

    doc.build(elements)
    return buffer.getvalue()
