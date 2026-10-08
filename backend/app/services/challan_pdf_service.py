"""Delivery Challan (DC) drawn like Sri Jayam's pre-printed challan book (A5 landscape)."""
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A5, landscape
from reportlab.lib.units import mm
from reportlab.lib.utils import simpleSplit
from reportlab.pdfgen import canvas

from app.models.delivery_challan import DeliveryChallan
from app.services.bill_pdf_service import (
    BAND, BRAND_RED, COMPANY_EMAIL, COMPANY_GSTIN, COMPANY_NAME, CASH_BILL_ADDRESS,
    CASH_BILL_MOBILES, GREY, INK, LINE, _chunks, _draw_logo, _fit,
)

ROWS_PER_PAGE = 10


def generate_challan_pdf(challan: DeliveryChallan) -> bytes:
    items = list(challan.items or [])
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=landscape(A5))
    c.setTitle(f"Delivery Challan {challan.dc_number}")
    pages = _chunks(items, ROWS_PER_PAGE)
    for idx, chunk in enumerate(pages):
        _draw_page(c, challan, chunk, idx * ROWS_PER_PAGE, idx + 1, len(pages))
        c.showPage()
    c.save()
    return buffer.getvalue()


def _draw_page(c, challan, chunk, start_index, page_no, page_count):
    W, H = landscape(A5)
    m = 5 * mm
    gap = 1.6 * mm

    # Thick blue frame, white panels on top of it (like the printed book).
    c.setFillColor(BAND)
    c.rect(m, m, W - 2 * m, H - 2 * m, fill=1, stroke=0)
    x0, x1 = m + gap, W - m - gap

    title_h = 9 * mm
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 12)
    c.drawCentredString(W / 2, H - m - 6.2 * mm, "DELIVERY CHALLAN")

    panel_top = H - m - title_h
    left_w = 100 * mm
    row1_h = 13 * mm
    to_h = 27 * mm
    right_x = x0 + left_w + gap
    right_w = x1 - right_x
    block_h = row1_h + gap + to_h

    def panel(x, y, w, h):
        c.setFillColor(colors.white)
        c.rect(x, y, w, h, fill=1, stroke=0)

    # ---- S.No. and Date -----------------------------------------------------
    sno_w = 38 * mm
    panel(x0, panel_top - row1_h, sno_w, row1_h)
    panel(x0 + sno_w + gap, panel_top - row1_h, left_w - sno_w - gap, row1_h)
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(x0 + 2 * mm, panel_top - 8.5 * mm, "S.No.:")
    _fit(c, challan.dc_number, x0 + 14 * mm, panel_top - 9 * mm, sno_w - 16 * mm, "Helvetica-Bold", 16)
    date_x = x0 + sno_w + gap + 2 * mm
    c.setFont("Helvetica-Bold", 9)
    c.drawString(date_x, panel_top - 8.5 * mm, "Date :")
    c.setFont("Helvetica-Bold", 12)
    c.drawString(date_x + 12 * mm, panel_top - 9 * mm, challan.challan_date.strftime("%d-%m-%Y"))

    # ---- To box (three dotted lines) --------------------------------------------
    to_bottom = panel_top - row1_h - gap - to_h
    panel(x0, to_bottom, left_w, to_h)
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 8.5)
    c.drawString(x0 + 2 * mm, to_bottom + to_h - 6.5 * mm, "To")
    to_lines = [l.strip() for l in (challan.to_text or "").splitlines() if l.strip()][:3]
    c.setStrokeColor(GREY)
    c.setLineWidth(0.6)
    c.setDash(1, 2)
    for i in range(3):
        y_line = to_bottom + to_h - (8.5 + i * 8) * mm
        c.line(x0 + 8 * mm, y_line, x0 + left_w - 3 * mm, y_line)
        if i < len(to_lines):
            c.setFillColor(INK)
            _fit(c, to_lines[i], x0 + 9 * mm, y_line + 1.3 * mm, left_w - 14 * mm, "Helvetica-Bold" if i == 0 else "Helvetica", 10)
    c.setDash()

    # ---- company box ----------------------------------------------------------
    panel(right_x, to_bottom, right_w, block_h)
    top = panel_top
    c.setFillColor(INK)
    _fit(c, f"GSTIN : {COMPANY_GSTIN}", right_x + 2 * mm, top - 5 * mm, right_w - 4 * mm, "Helvetica-Bold", 8, "right")
    _fit(c, f"Email : {COMPANY_EMAIL}", right_x + 2 * mm, top - 9 * mm, right_w - 4 * mm, "Helvetica", 6.8, "right")
    text_x = right_x + 3 * mm
    if _draw_logo(c, right_x + 2 * mm, top - 24 * mm, 18 * mm, 15 * mm):
        text_x = right_x + 22 * mm
    c.setFillColor(BRAND_RED)
    _fit(c, COMPANY_NAME, text_x, top - 19 * mm, right_x + right_w - 3 * mm - text_x, "Times-BoldItalic", 21)
    c.setFillColor(INK)
    for i, line in enumerate(simpleSplit(CASH_BILL_ADDRESS, "Helvetica-Bold", 7, right_w - 6 * mm)[:2]):
        c.setFont("Helvetica-Bold", 7)
        c.drawCentredString(right_x + right_w / 2, top - 27.5 * mm - i * 3 * mm, line)
    _fit(c, "Mob : " + ", ".join(CASH_BILL_MOBILES), right_x + 3 * mm, top - 37 * mm, right_w - 6 * mm, "Helvetica-Bold", 8.5, "center")

    # ---- particulars table --------------------------------------------------------
    table_top = to_bottom - gap
    table_bottom = m + gap
    panel(x0, table_bottom, x1 - x0, table_top - table_bottom)

    head_h = 7 * mm
    foot_h = 9 * mm
    body_bottom = table_bottom + foot_h
    body_top = table_top - head_h
    row_h = (body_top - body_bottom) / ROWS_PER_PAGE
    sno_col, qty_col = 14 * mm, 28 * mm
    x_sno = x0 + sno_col
    x_qty = x1 - qty_col

    c.setStrokeColor(LINE)
    c.setLineWidth(0.8)
    c.rect(x0, body_bottom, x1 - x0, table_top - body_bottom)
    c.line(x0, body_top, x1, body_top)
    c.line(x_sno, body_bottom, x_sno, table_top)
    c.line(x_qty, body_bottom, x_qty, table_top)
    c.setLineWidth(0.4)
    c.setStrokeColor(colors.HexColor("#9aa3d6"))
    for i in range(1, ROWS_PER_PAGE):
        y_line = body_top - i * row_h
        c.line(x0, y_line, x1, y_line)

    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 7.5)
    c.drawCentredString(x0 + sno_col / 2, body_top + 2.4 * mm, "S.No.")
    c.drawCentredString((x_sno + x_qty) / 2, body_top + 2.4 * mm, "P A R T I C U L A R S")
    c.drawCentredString((x_qty + x1) / 2, body_top + 2.4 * mm, "Qty")

    for i, item in enumerate(chunk):
        base = body_top - i * row_h - 4.6 * mm
        _fit(c, start_index + i + 1, x0, base, sno_col, "Helvetica", 9, "center")
        _fit(c, item.get("particulars", ""), x_sno + 2 * mm, base, x_qty - x_sno - 4 * mm, "Helvetica", 9.5)
        _fit(c, item.get("qty", ""), x_qty + 1 * mm, base, qty_col - 2 * mm, "Helvetica-Bold", 9.5, "center")

    # ---- footer ---------------------------------------------------------------------
    base = table_bottom + 3 * mm
    name_w = c.stringWidth(COMPANY_NAME, "Times-BoldItalic", 12)
    c.setFillColor(BRAND_RED)
    c.setFont("Times-BoldItalic", 12)
    c.drawRightString(x1 - 3 * mm, base, COMPANY_NAME)
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 7.5)
    c.drawRightString(x1 - 3 * mm - name_w - 1.5 * mm, base, "For")
    if page_count > 1:
        c.setFillColor(GREY)
        c.setFont("Helvetica", 7)
        c.drawString(x0 + 2 * mm, base, f"Page {page_no} of {page_count}")