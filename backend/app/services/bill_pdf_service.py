"""Filled-in versions of Sri Jayam Printers' two pre-printed bill books.

* generate_gst_bill_pdf  -> the tax INVOICE (A4, CGST / SGST columns)
* generate_cash_bill_pdf -> the CASH BILL (A5, Qty / Rate / Amount Rs. P.)

Optional: drop the shop logo at  backend/app/assets/logo.png  and it is drawn
in the header of both bills automatically.
"""
import os
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, A5
from reportlab.lib.units import mm
from reportlab.lib.utils import simpleSplit
from reportlab.pdfgen import canvas

from app.models.customer import Customer
from app.models.invoice import Invoice
from app.models.product import Product
from app.services.pdf_service import amount_in_words

# ---- Shop details printed on the bill books --------------------------------
COMPANY_NAME = "Sri Jayam Printers"
COMPANY_GSTIN = "33AHQPJ2395E1Z9"
COMPANY_EMAIL = "srijayamprinterscmyk@gmail.com"
LANDLINE = "044 43328016"
GST_BILL_MOBILES = "9941166664 / 9962183355"
GST_BILL_ADDRESS = "D.R.G. Complex, OM Mahabalipuram Road, Navalur, Chennai - 600 130."
CASH_BILL_MOBILES = ["99621 83355", "99621 13355", "99411 66664"]
CASH_BILL_ADDRESS = "D.R.G.Complex, Rajiv Gandhi Salai, (OMR), Navalur, Chennai - 600 130."
# Products don't carry an HSN/SAC code yet -- put one here (e.g. "4911") to
# print it on every row of the GST invoice, or leave "" to keep the column blank.
DEFAULT_HSN_SAC = ""

LOGO_PATH = os.path.join(os.path.dirname(__file__), "..", "assets", "logo.png")

LINE = colors.HexColor("#3b4a9c")
BAND = colors.HexColor("#3d4fa3")
TINT = colors.HexColor("#e9ebf7")
BRAND_RED = colors.HexColor("#c0392b")
INK = colors.HexColor("#111111")
GREY = colors.HexColor("#666666")


# ---- small drawing helpers --------------------------------------------------
def _fit(c, text, x, y, width, font="Helvetica", size=9.0, align="left", min_size=5.0):
    """Draw text inside `width`, shrinking the font if it would overflow."""
    text = str(text)
    while size > min_size and c.stringWidth(text, font, size) > width:
        size -= 0.5
    c.setFont(font, size)
    if align == "right":
        c.drawRightString(x + width, y, text)
    elif align == "center":
        c.drawCentredString(x + width / 2, y, text)
    else:
        c.drawString(x, y, text)


def _money(value: float) -> str:
    return f"{value:.2f}"


def _rs_p(value: float) -> tuple[str, str]:
    paise_total = int(round(value * 100))
    return str(paise_total // 100), f"{paise_total % 100:02d}"


def _particulars_lines(product: Product | None, item, font: str, size: float, width: float) -> list[tuple[str, bool]]:
    """Up to two (text, is_note) lines: the product name first, then spec notes if there is room."""
    name = product.name if product else f"Product #{item.product_id}"
    lines = [(t, False) for t in simpleSplit(name, font, size, width)]
    notes = getattr(item, "spec_notes", None)
    if notes and len(lines) < 2:
        lines += [(t, True) for t in simpleSplit(notes, "Helvetica", size - 1, width)]
    return lines[:2]


def _draw_logo(c, x, y, w, h) -> bool:
    if os.path.exists(LOGO_PATH):
        c.drawImage(LOGO_PATH, x, y, width=w, height=h, preserveAspectRatio=True, mask="auto")
        return True
    return False


def _tax_rate(invoice: Invoice) -> float:
    if invoice.tax is not None and invoice.tax.rate_percent is not None:
        return float(invoice.tax.rate_percent)
    return (invoice.tax_amount / invoice.subtotal * 100) if invoice.subtotal else 0.0


def _chunks(seq, size):
    if not seq:
        return [[]]
    return [seq[i:i + size] for i in range(0, len(seq), size)]


def _strip_rupees(words: str) -> str:
    return words[len("Rupees "):] if words.startswith("Rupees ") else words


# =============================================================================
# 1) GST INVOICE  (A4)
# =============================================================================
GST_COLS_MM = [9, 46, 16, 11, 17, 20, 9, 15, 9, 15, 23]  # sums to 190mm
GST_ROWS_PER_PAGE = 16


def generate_gst_bill_pdf(invoice: Invoice, customer: Customer, products_by_id: dict[int, Product]) -> bytes:
    rate = _tax_rate(invoice)
    half = rate / 2
    rows = []
    for item in invoice.items:
        product = products_by_id.get(item.product_id)
        cgst = round(item.total_price * rate / 200, 2)
        rows.append({
            "product": product,
            "item": item,
            "cgst_amt": cgst,
            "sgst_amt": cgst,
            "total": item.total_price + 2 * cgst,
        })

    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    c.setTitle(f"Invoice {invoice.invoice_number}")
    pages = _chunks(rows, GST_ROWS_PER_PAGE)
    for idx, chunk in enumerate(pages):
        _draw_gst_page(c, invoice, customer, chunk, idx * GST_ROWS_PER_PAGE, half,
                       page_no=idx + 1, page_count=len(pages), is_last=(idx == len(pages) - 1))
        c.showPage()
    c.save()
    return buffer.getvalue()


def _draw_gst_page(c, invoice, customer, chunk, start_index, half_rate, page_no, page_count, is_last):
    W, H = A4
    m = 8 * mm
    pad = 2 * mm
    c.setStrokeColor(LINE)
    c.setFillColor(INK)
    c.setLineWidth(1.2)
    c.rect(m, m, W - 2 * m, H - 2 * m)

    x0 = m + pad
    x1 = W - m - pad
    iw = x1 - x0
    top = H - m - pad

    # ---- header ------------------------------------------------------------
    left_w = 118 * mm
    right_x = x0 + left_w
    right_w = iw - left_w
    band_h, cell_h = 9 * mm, 8 * mm
    header_h = band_h + 5 * cell_h
    header_bottom = top - header_h
    logo_h = 28 * mm

    c.setLineWidth(0.8)
    c.rect(x0, top - logo_h, left_w, logo_h)                      # logo / name box
    c.rect(x0, header_bottom, left_w, header_h - logo_h)          # "To" box

    text_x = x0 + 3 * mm
    if _draw_logo(c, x0 + 2 * mm, top - logo_h + 2 * mm, 26 * mm, logo_h - 4 * mm):
        text_x = x0 + 30 * mm
    text_w = x0 + left_w - 3 * mm - text_x
    c.setFillColor(INK)
    _fit(c, f"Ph : {LANDLINE}", text_x, top - 5 * mm, text_w, "Helvetica-Bold", 8.5, "right")
    c.setFillColor(BRAND_RED)
    _fit(c, COMPANY_NAME, text_x, top - 14 * mm, text_w, "Times-BoldItalic", 24)
    c.setFillColor(INK)
    for i, line in enumerate(simpleSplit(GST_BILL_ADDRESS, "Helvetica-Bold", 7, text_w)[:2]):
        c.setFont("Helvetica-Bold", 7)
        c.drawString(text_x, top - 19.5 * mm - i * 3.2 * mm, line)
    _fit(c, f"Email : {COMPANY_EMAIL}", text_x, top - 26 * mm, text_w, "Helvetica-Bold", 6.5)

    # right-hand cells
    c.setFillColor(BAND)
    c.rect(right_x, top - band_h, right_w, band_h, fill=1, stroke=1)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 13)
    c.drawCentredString(right_x + right_w / 2, top - band_h + 2.8 * mm, "INVOICE")
    c.setFillColor(INK)
    cells = [
        ("GSTIN: ", COMPANY_GSTIN),
        ("Sl.No.   ", invoice.invoice_number),
        ("Date   ", invoice.invoice_date.strftime("%d-%m-%Y")),
        ("Mob. : ", GST_BILL_MOBILES),
        ("Party GSTIN: ", (customer.gstin or "").strip()),
    ]
    cy = top - band_h
    for i, (label, value) in enumerate(cells):
        c.rect(right_x, cy - (i + 1) * cell_h, right_w, cell_h)
        base = cy - (i + 1) * cell_h + 2.7 * mm
        c.setFont("Helvetica", 8.5)
        c.drawString(right_x + 2 * mm, base, label)
        lw = c.stringWidth(label, "Helvetica", 8.5)
        _fit(c, value, right_x + 2 * mm + lw, base, right_w - 4 * mm - lw, "Helvetica-Bold", 8.5)

    # "To" box
    to_top = header_bottom + (header_h - logo_h)
    c.setFont("Helvetica", 8.5)
    c.drawString(x0 + 2 * mm, to_top - 5 * mm, "To:")
    to_lines = [(customer.name, "Helvetica-Bold", 9.5)]
    for l in simpleSplit(customer.address or "", "Helvetica", 8, left_w - 14 * mm)[:2] if customer.address else []:
        to_lines.append((l, "Helvetica", 8))
    if customer.phone:
        to_lines.append((f"Ph: {customer.phone}", "Helvetica", 8))
    for i, (txt, font, size) in enumerate(to_lines[:4]):
        _fit(c, txt, x0 + 10 * mm, to_top - 5 * mm - i * 4.2 * mm, left_w - 13 * mm, font, size)

    # ---- items table -------------------------------------------------------
    cols = [w * mm for w in GST_COLS_MM]
    xs = [x0]
    for w in cols:
        xs.append(xs[-1] + w)

    table_top = header_bottom - 2 * mm
    head_h = 11 * mm
    body_top = table_top - head_h
    footer_h = 46 * mm
    footer_bottom = m + pad
    body_bottom = footer_bottom + footer_h
    row_h = (body_top - body_bottom) / GST_ROWS_PER_PAGE

    c.setFillColor(TINT)
    c.rect(x0, body_top, iw, head_h, fill=1, stroke=0)
    c.setFillColor(INK)
    c.setLineWidth(0.8)
    c.rect(x0, body_bottom, iw, table_top - body_bottom)
    c.line(x0, body_top, x1, body_top)
    mid = body_top + head_h / 2
    for i in range(1, len(cols)):
        if i in (7, 9):  # inside the CGST / SGST groups: only the lower half of the header
            c.line(xs[i], body_top, xs[i], mid)
        else:
            c.line(xs[i], body_bottom, xs[i], table_top)
    # body verticals for the split columns
    for i in (7, 9):
        c.line(xs[i], body_bottom, xs[i], body_top)
    c.line(xs[6], mid, xs[8], mid)
    c.line(xs[8], mid, xs[10], mid)

    def head(label, i, j=None, y_off=None, size=7.5):
        x_a, x_b = xs[i], xs[(j if j is not None else i) + 1]
        parts = label.split("\n")
        if y_off is None:
            y_off = body_top + head_h / 2 + (len(parts) - 1) * 1.7 * mm - 1.2 * mm
        for k, part in enumerate(parts):
            c.setFont("Helvetica-Bold", size)
            c.drawCentredString((x_a + x_b) / 2, y_off - k * 3.4 * mm, part)

    head("Sl.\nNo", 0)
    head("Particulars", 1)
    head("HSN /\nSAC", 2)
    head("QTY.", 3)
    head("Rate", 4)
    head("Amount", 5)
    head("CGST", 6, 7, y_off=mid + 1.6 * mm)
    head("SGST", 8, 9, y_off=mid + 1.6 * mm)
    head("%", 6, y_off=body_top + 1.7 * mm, size=7)
    head("Amount", 7, y_off=body_top + 1.7 * mm, size=7)
    head("%", 8, y_off=body_top + 1.7 * mm, size=7)
    head("Amount", 9, y_off=body_top + 1.7 * mm, size=7)
    head("TOTAL\nAmount", 10)

    pct = f"{half_rate:g}"
    for i, row in enumerate(chunk):
        item = row["item"]
        row_top = body_top - i * row_h
        base = row_top - 5 * mm
        c.setFillColor(INK)
        _fit(c, start_index + i + 1, xs[0], base, cols[0], "Helvetica", 8.5, "center")
        for k, (line, is_note) in enumerate(_particulars_lines(row["product"], item, "Helvetica", 8, cols[1] - 3 * mm)):
            c.setFont("Helvetica-Oblique" if is_note else "Helvetica", 7 if is_note else 8)
            c.drawString(xs[1] + 1.5 * mm, base - k * 3.6 * mm, line)
        _fit(c, DEFAULT_HSN_SAC, xs[2], base, cols[2], "Helvetica", 8, "center")
        _fit(c, item.quantity, xs[3], base, cols[3], "Helvetica", 8.5, "center")
        _fit(c, _money(item.unit_price), xs[4] + 1 * mm, base, cols[4] - 2.5 * mm, "Helvetica", 8.5, "right")
        _fit(c, _money(item.total_price), xs[5] + 1 * mm, base, cols[5] - 2.5 * mm, "Helvetica", 8.5, "right")
        _fit(c, pct, xs[6], base, cols[6], "Helvetica", 8, "center")
        _fit(c, _money(row["cgst_amt"]), xs[7] + 1 * mm, base, cols[7] - 2.5 * mm, "Helvetica", 8.5, "right")
        _fit(c, pct, xs[8], base, cols[8], "Helvetica", 8, "center")
        _fit(c, _money(row["sgst_amt"]), xs[9] + 1 * mm, base, cols[9] - 2.5 * mm, "Helvetica", 8.5, "right")
        _fit(c, _money(row["total"]), xs[10] + 1 * mm, base, cols[10] - 2.5 * mm, "Helvetica-Bold", 8.5, "right")

    # ---- footer ------------------------------------------------------------
    if page_count > 1:
        c.setFillColor(GREY)
        c.setFont("Helvetica", 7)
        c.drawString(x0 + 2 * mm, footer_bottom + 2 * mm, f"Page {page_no} of {page_count}")
    if not is_last:
        c.setFillColor(GREY)
        c.setFont("Helvetica-Oblique", 8)
        c.drawString(x0 + 2 * mm, footer_bottom + footer_h - 6 * mm, "Continued on next page...")
        return

    box_h = 8 * mm
    rb_w = 85 * mm
    rb_x = x1 - rb_w
    f_top = footer_bottom + footer_h
    c.setFillColor(INK)
    c.setLineWidth(0.8)
    c.rect(x0, f_top - 4 * box_h, rb_x - x0, 4 * box_h)
    c.setFont("Helvetica", 8.5)
    c.drawString(x0 + 2 * mm, f_top - 5.5 * mm, "Rupees Inwords :")
    words = _strip_rupees(amount_in_words(invoice.grand_total))
    for k, line in enumerate(simpleSplit(words, "Helvetica-Oblique", 9, rb_x - x0 - 6 * mm)[:3]):
        c.setFont("Helvetica-Oblique", 9)
        c.drawString(x0 + 3 * mm, f_top - 11 * mm - k * 4.5 * mm, line)

    totals = [
        ("Grand TOTAL", invoice.grand_total, True),
        ("Total Amount Before Tax", invoice.subtotal, False),
        ("Tax Amount (GST)", invoice.tax_amount, False),
        ("Total Amount After Tax", invoice.grand_total, True),
    ]
    label_w = 57 * mm
    for i, (label, value, bold) in enumerate(totals):
        y_row = f_top - (i + 1) * box_h
        c.rect(rb_x, y_row, label_w, box_h)
        c.rect(rb_x + label_w, y_row, rb_w - label_w, box_h)
        font = "Helvetica-Bold" if bold else "Helvetica"
        _fit(c, label, rb_x, y_row + 2.6 * mm, label_w - 2 * mm, font, 8.5, "right")
        _fit(c, _money(value), rb_x + label_w, y_row + 2.6 * mm, rb_w - label_w - 2 * mm, font, 9, "right")

    c.setFont("Helvetica-Bold", 8)
    c.drawRightString(x1 - 58 * mm, footer_bottom + 3 * mm, "FOR")
    c.setFillColor(BRAND_RED)
    _fit(c, COMPANY_NAME, x1 - 56 * mm, footer_bottom + 3 * mm, 56 * mm, "Times-BoldItalic", 15)


# =============================================================================
# 2) CASH BILL  (A5)
# =============================================================================
CASH_COLS_MM = [9, 62, 12, 21, 28]  # sums to 132mm
CASH_RS_MM = 22                      # width of the "Rs." half of the Amount column
CASH_ROWS_PER_PAGE = 10


def generate_cash_bill_pdf(invoice: Invoice, customer: Customer, products_by_id: dict[int, Product]) -> bytes:
    rows = [{"product": products_by_id.get(item.product_id), "item": item} for item in invoice.items]
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=A5)
    c.setTitle(f"Cash Bill {invoice.invoice_number}")
    pages = _chunks(rows, CASH_ROWS_PER_PAGE)
    for idx, chunk in enumerate(pages):
        _draw_cash_page(c, invoice, customer, chunk, idx * CASH_ROWS_PER_PAGE,
                        page_no=idx + 1, page_count=len(pages), is_last=(idx == len(pages) - 1))
        c.showPage()
    c.save()
    return buffer.getvalue()


def _draw_cash_page(c, invoice, customer, chunk, start_index, page_no, page_count, is_last):
    W, H = A5
    m = 6 * mm
    pad = 2 * mm
    c.setStrokeColor(LINE)
    c.setFillColor(INK)
    c.setLineWidth(1.2)
    c.rect(m, m, W - 2 * m, H - 2 * m)

    x0, x1 = m + pad, W - m - pad
    iw = x1 - x0
    top = H - m - pad

    # ---- header ------------------------------------------------------------
    left_w = 82 * mm
    right_x = x0 + left_w
    right_w = iw - left_w
    header_h = 30 * mm
    band_h = 9 * mm
    c.setLineWidth(0.8)
    c.rect(x0, top - header_h, left_w, header_h)

    text_x = x0 + 3 * mm
    if _draw_logo(c, x0 + 2 * mm, top - header_h + 2 * mm, 20 * mm, header_h - 12 * mm):
        text_x = x0 + 24 * mm
    text_w = x0 + left_w - 2 * mm - text_x
    c.setFillColor(INK)
    _fit(c, f"GSTIN : {COMPANY_GSTIN}", text_x, top - 4 * mm, text_w, "Helvetica-Bold", 6.5, "right")
    _fit(c, f"Email: {COMPANY_EMAIL}", text_x, top - 7.5 * mm, text_w, "Helvetica", 6, "right")
    c.setFillColor(BRAND_RED)
    _fit(c, COMPANY_NAME, text_x, top - 17 * mm, text_w, "Times-BoldItalic", 17)
    c.setFillColor(INK)
    for i, line in enumerate(simpleSplit(CASH_BILL_ADDRESS, "Helvetica-Bold", 6.5, left_w - 6 * mm)[:2]):
        c.setFont("Helvetica-Bold", 6.5)
        c.drawString(x0 + 3 * mm, top - 23 * mm - i * 3 * mm, line)

    c.setFillColor(BAND)
    c.rect(right_x, top - band_h, right_w, band_h, fill=1, stroke=1)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 12)
    c.drawCentredString(right_x + right_w / 2, top - band_h + 2.8 * mm, "CASH BILL")
    c.setFillColor(INK)
    c.rect(right_x, top - header_h, right_w, header_h - band_h)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(right_x + 2 * mm, top - band_h - 5.5 * mm, "Mob :")
    for i, number in enumerate(CASH_BILL_MOBILES):
        c.drawString(right_x + 13 * mm, top - band_h - 5.5 * mm - i * 5 * mm, number)

    # ---- To / S.No. / Date -------------------------------------------------
    to_top = top - header_h
    to_h = 16 * mm
    c.rect(x0, to_top - to_h, left_w, to_h)
    c.rect(right_x, to_top - to_h, right_w, to_h)
    c.setFont("Helvetica", 8.5)
    c.drawString(x0 + 2 * mm, to_top - 5 * mm, "To")
    _fit(c, customer.name, x0 + 9 * mm, to_top - 5 * mm, left_w - 11 * mm, "Helvetica-Bold", 9.5)
    second = customer.address or (f"Ph: {customer.phone}" if customer.phone else "")
    if second:
        _fit(c, second, x0 + 9 * mm, to_top - 10 * mm, left_w - 11 * mm, "Helvetica", 7.5)
    if customer.address and customer.phone:
        _fit(c, f"Ph: {customer.phone}", x0 + 9 * mm, to_top - 14 * mm, left_w - 11 * mm, "Helvetica", 7.5)
    c.setFont("Helvetica", 8.5)
    c.drawString(right_x + 2 * mm, to_top - 5.5 * mm, "S.No.:")
    _fit(c, invoice.invoice_number, right_x + 13 * mm, to_top - 5.5 * mm, right_w - 15 * mm, "Helvetica-Bold", 10)
    c.setFont("Helvetica", 8.5)
    c.drawString(right_x + 2 * mm, to_top - 12 * mm, "Date :")
    _fit(c, invoice.invoice_date.strftime("%d-%m-%Y"), right_x + 13 * mm, to_top - 12 * mm,
         right_w - 15 * mm, "Helvetica-Bold", 9.5)

    # ---- items table -------------------------------------------------------
    cols = [w * mm for w in CASH_COLS_MM]
    xs = [x0]
    for w in cols:
        xs.append(xs[-1] + w)
    rs_w = CASH_RS_MM * mm

    table_top = to_top - to_h - 2 * mm
    head_h = 8 * mm
    body_top = table_top - head_h
    bottom_block_h = 14 * mm
    totals_h = 3 * 8 * mm
    body_bottom = m + pad + bottom_block_h + 2 * mm + totals_h
    row_h = (body_top - body_bottom) / CASH_ROWS_PER_PAGE

    c.setFillColor(TINT)
    c.rect(x0, body_top, iw, head_h, fill=1, stroke=0)
    c.setFillColor(INK)
    c.rect(x0, body_bottom, iw, table_top - body_bottom)
    c.line(x0, body_top, x1, body_top)
    for i in range(1, len(cols)):
        c.line(xs[i], body_bottom, xs[i], table_top)
    c.line(xs[4] + rs_w, body_bottom, xs[4] + rs_w, body_top + head_h / 2)
    c.line(xs[4], body_top + head_h / 2, x1, body_top + head_h / 2)
    c.line(xs[4] + rs_w, body_bottom, xs[4] + rs_w, body_top)

    def head(text, i, y, size=8, font="Helvetica-Bold"):
        c.setFont(font, size)
        c.drawCentredString((xs[i] + xs[i + 1]) / 2, y, text)

    mid_y = body_top + head_h / 2 - 1.2 * mm
    head("S.No.", 0, mid_y, 7)
    head("P A R T I C U L A R S", 1, mid_y, 7.5)
    head("Qty", 2, mid_y, 8)
    head("Rate", 3, mid_y, 8)
    head("Amount", 4, body_top + head_h - 3.2 * mm, 7)
    c.setFont("Helvetica-Bold", 7)
    c.drawCentredString(xs[4] + rs_w / 2, body_top + 1.4 * mm, "Rs.")
    c.drawCentredString(xs[4] + rs_w + (cols[4] - rs_w) / 2, body_top + 1.4 * mm, "P.")

    c.setStrokeColor(colors.HexColor("#9aa3d6"))
    c.setLineWidth(0.4)
    for i in range(1, CASH_ROWS_PER_PAGE):
        y_line = body_top - i * row_h
        c.line(x0, y_line, x1, y_line)
    c.setStrokeColor(LINE)
    c.setLineWidth(0.8)

    for i, row in enumerate(chunk):
        item = row["item"]
        row_top = body_top - i * row_h
        base = row_top - 4.8 * mm
        c.setFillColor(INK)
        _fit(c, start_index + i + 1, xs[0], base, cols[0], "Helvetica", 8.5, "center")
        for k, (line, is_note) in enumerate(_particulars_lines(row["product"], item, "Helvetica", 8.5, cols[1] - 3 * mm)):
            c.setFont("Helvetica-Oblique" if is_note else "Helvetica", 7 if is_note else 8.5)
            c.drawString(xs[1] + 1.5 * mm, base - k * 3.6 * mm, line)
        _fit(c, item.quantity, xs[2], base, cols[2], "Helvetica", 8.5, "center")
        _fit(c, _money(item.unit_price), xs[3], base, cols[3] - 2 * mm, "Helvetica", 8.5, "right")
        rs, p = _rs_p(item.total_price)
        _fit(c, rs, xs[4], base, rs_w - 2 * mm, "Helvetica-Bold", 9, "right")
        _fit(c, p, xs[4] + rs_w, base, cols[4] - rs_w, "Helvetica", 8.5, "center")

    # ---- footer: Total / Advance / Balance + Rupees / For ------------------
    bottom_y = m + pad
    if page_count > 1:
        c.setFillColor(GREY)
        c.setFont("Helvetica", 6.5)
        c.drawString(x0 + 1 * mm, body_bottom - 3.5 * mm, f"Page {page_no} of {page_count}")
    if not is_last:
        c.setFillColor(GREY)
        c.setFont("Helvetica-Oblique", 8)
        c.drawRightString(x1 - 2 * mm, body_bottom - 6 * mm, "Continued on next page...")
        return

    total = invoice.subtotal
    advance = invoice.amount_paid or 0.0
    balance = max(total - advance, 0.0)
    row_box = 8 * mm
    c.setFillColor(INK)
    c.rect(x0, body_bottom - totals_h, xs[2] - x0, totals_h)
    for i, (label, value, bold) in enumerate([("Total", total, True), ("Advance", advance, False), ("Balance", balance, True)]):
        y_row = body_bottom - (i + 1) * row_box
        c.rect(xs[2], y_row, xs[4] - xs[2], row_box)
        c.rect(xs[4], y_row, rs_w, row_box)
        c.rect(xs[4] + rs_w, y_row, cols[4] - rs_w, row_box)
        font = "Helvetica-Bold" if bold else "Helvetica"
        _fit(c, label, xs[2], y_row + 2.6 * mm, xs[4] - xs[2] - 3 * mm, font, 9, "right")
        rs, p = _rs_p(value)
        _fit(c, rs, xs[4], y_row + 2.6 * mm, rs_w - 2 * mm, font, 9.5, "right")
        _fit(c, p, xs[4] + rs_w, y_row + 2.6 * mm, cols[4] - rs_w, font, 8.5, "center")

    bb_top = bottom_y + bottom_block_h
    c.rect(x0, bottom_y, left_w, bottom_block_h)
    c.rect(right_x, bottom_y, right_w, bottom_block_h)
    c.setFont("Helvetica", 7)
    c.drawString(x0 + 2 * mm, bb_top - 4 * mm, "Rupees")
    words = _strip_rupees(amount_in_words(total))
    for k, line in enumerate(simpleSplit(words, "Helvetica-Oblique", 8, left_w - 16 * mm)[:2]):
        c.setFont("Helvetica-Oblique", 8)
        c.drawString(x0 + 12 * mm, bb_top - 4 * mm - k * 4 * mm, line)
    c.setFont("Helvetica-Bold", 7.5)
    c.drawString(right_x + 2 * mm, bottom_y + 5 * mm, "For")
    c.setFillColor(BRAND_RED)
    _fit(c, COMPANY_NAME, right_x + 9 * mm, bottom_y + 5 * mm, right_w - 11 * mm, "Times-BoldItalic", 11)