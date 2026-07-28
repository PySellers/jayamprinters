from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_RIGHT

from app.models.invoice import Invoice
from app.models.customer import Customer
from app.models.product import Product

BRAND_COLOR = colors.HexColor("#1a237e")


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
        ["Grand Total", f"Rs. {invoice.grand_total:.2f}"],
        ["Paid", f"Rs. {invoice.amount_paid:.2f}"],
        ["Balance", f"Rs. {invoice.grand_total - invoice.amount_paid:.2f}"],
    ]
    totals_table = Table(totals_data, colWidths=[135 * mm, 30 * mm])
    totals_table.setStyle(TableStyle([
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("FONTNAME", (0, 2), (-1, 2), "Helvetica-Bold"),
        ("LINEABOVE", (0, 2), (-1, 2), 0.75, colors.grey),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    elements.append(totals_table)

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

    doc.build(elements)
    return buffer.getvalue()
