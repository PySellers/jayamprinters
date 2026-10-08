"""Quotation letter drawn like Sri Jayam's sample quotation:
letterhead, Ref / Date, a Particulars-Qty-Rate-Amount table, then Terms & Conditions."""
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import simpleSplit
from reportlab.pdfgen import canvas

from app.models.customer import Customer
from app.models.product import Product
from app.models.quotation import Quotation
from app.services.bill_pdf_service import (
    BRAND_RED, CASH_BILL_ADDRESS, CASH_BILL_MOBILES, COMPANY_EMAIL, COMPANY_NAME,
    GREY, INK, _draw_logo, _fit, _money,
)
from app.services.time_utils import utc_naive_to_ist

COLS_MM = [14, 100, 18, 22, 26]  # Sl.No, Particulars, Qty, Rate, Amount = 180mm
LINE_H = 3.9 * mm
FONT = "Helvetica"
SIZE = 8.5


def _particulars(item, product: Product | None) -> str:
    """Product name, then its chosen options / notes in brackets, like
    'Hot Work Permit (1x3 Size_1+2 / 100 set)'."""
    name = product.name if product else f"Product #{item.product_id}"
    details = []
    for selected in item.selected_options or []:
        attribute = selected.attribute.name if selected.attribute else ""
        option = selected.attribute_option.value if selected.attribute_option else ""
        if option:
            details.append(f"{attribute}: {option}" if attribute else option)
    if item.spec_notes:
        details.append(item.spec_notes)
    return f"{name} ({', '.join(details)})" if details else name


def _tax_rate(quotation: Quotation) -> float:
    if quotation.tax is not None and quotation.tax.rate_percent is not None:
        return float(quotation.tax.rate_percent)
    return (quotation.tax_amount / quotation.total_amount * 100) if quotation.total_amount else 0.0


def generate_quotation_pdf(quotation: Quotation, customer: Customer, products_by_id: dict[int, Product]) -> bytes:
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    c.setTitle(f"Quotation {quotation.quotation_number}")
    W, H = A4
    left = 15 * mm
    right = W - 15 * mm
    cols = [w * mm for w in COLS_MM]
    xs = [left]
    for w in cols:
        xs.append(xs[-1] + w)
    bottom_limit = 38 * mm  # keep the table clear of the footer

    date_text = utc_naive_to_ist(quotation.created_at).strftime("%d.%m.%Y") if quotation.created_at else ""

    def letterhead(first_page: bool) -> float:
        """Draws the page header, returns the y where the table starts."""
        text_x = left
        if _draw_logo(c, left, H - 33 * mm, 22 * mm, 20 * mm):
            text_x = left + 25 * mm
        c.setFillColor(BRAND_RED)
        _fit(c, COMPANY_NAME, text_x, H - 25 * mm, 100 * mm, "Times-BoldItalic", 28)
        c.setFillColor(INK)
        c.setFont("Helvetica", 8)
        c.drawRightString(right, H - 38 * mm, f"Date : {date_text}")
        y = H - 46 * mm
        if first_page:
            c.setFont("Helvetica", 8)
            c.drawString(left, y, "Ref:")
            c.setFont("Helvetica-Bold", 9)
            c.drawString(left, y - 5 * mm, customer.name)
            y -= 5 * mm
            c.setFont("Helvetica", 8.5)
            for line in simpleSplit(customer.address or "", "Helvetica", 8.5, 110 * mm)[:2] if customer.address else []:
                y -= 4.2 * mm
                c.drawString(left, y, line)
            y -= 8 * mm
        else:
            y -= 4 * mm
        return y

    def footer():
        c.setFillColor(colors.HexColor("#b5b5b5"))
        c.setFont("Helvetica", 6.5)
        c.drawCentredString(W / 2, 14 * mm, f"{CASH_BILL_ADDRESS}   Mob: {', '.join(CASH_BILL_MOBILES)}")
        c.drawCentredString(W / 2, 10.5 * mm, f"Email: {COMPANY_EMAIL}")

    def table_header(y: float) -> float:
        head_h = 7 * mm
        c.setStrokeColor(INK)
        c.setLineWidth(0.6)
        c.rect(left, y - head_h, right - left, head_h)
        for i in range(1, len(cols)):
            c.line(xs[i], y - head_h, xs[i], y)
        c.setFillColor(INK)
        for i, label in enumerate(["Sl.No", "Particulars", "Qty.", "Rate", "Amount"]):
            c.setFont("Helvetica-Bold", 8)
            c.drawCentredString((xs[i] + xs[i + 1]) / 2, y - 4.7 * mm, label)
        return y - head_h

    y = table_header(letterhead(True))
    page_started_rows = True
    for index, item in enumerate(quotation.items, start=1):
        text = _particulars(item, products_by_id.get(item.product_id))
        lines = simpleSplit(text, FONT, SIZE, cols[1] - 4 * mm)
        row_h = max(7 * mm, len(lines) * LINE_H + 3 * mm)
        if y - row_h < bottom_limit:  # next page
            footer()
            c.showPage()
            y = table_header(letterhead(False))
        c.setStrokeColor(INK)
        c.setLineWidth(0.6)
        c.rect(left, y - row_h, right - left, row_h)
        for i in range(1, len(cols)):
            c.line(xs[i], y - row_h, xs[i], y)
        c.setFillColor(INK)
        base = y - 4.8 * mm
        _fit(c, index, xs[0], base, cols[0], FONT, SIZE, "center")
        c.setFont(FONT, SIZE)
        for k, line in enumerate(lines):
            c.drawString(xs[1] + 2 * mm, base - k * LINE_H, line)
        _fit(c, item.quantity, xs[2], base, cols[2] - 2 * mm, FONT, SIZE, "right")
        _fit(c, _money(item.unit_price), xs[3], base, cols[3] - 2 * mm, FONT, SIZE, "right")
        _fit(c, _money(item.total_price), xs[4], base, cols[4] - 2 * mm, FONT, SIZE, "right")
        y -= row_h

    # ---- terms & conditions ----------------------------------------------------
    terms = []
    if quotation.with_gst:
        terms.append(f"*GST {_tax_rate(quotation):g}% Extra")
    terms.append("*Delivery As Usual")
    if y - (8 + 5 * len(terms)) * mm < bottom_limit - 10 * mm:
        footer()
        c.showPage()
        y = letterhead(False)
    y -= 9 * mm
    c.setFillColor(INK)
    c.setFont("Helvetica", 8.5)
    c.drawString(left, y, "Terms & Conditions")
    for term in terms:
        y -= 5 * mm
        c.drawString(left, y, term)
    footer()
    c.showPage()
    c.save()
    return buffer.getvalue()