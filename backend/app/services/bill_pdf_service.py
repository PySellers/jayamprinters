"""Sri Jayam Printers' bills, drawn like the pre-printed bill books (all A4).

* generate_gst_bill_pdf  -> the tax INVOICE (A4 portrait: HSN / SAC, CGST and SGST per line)
* generate_cash_bill_pdf -> the CASH BILL (A4 landscape: Qty / Rate / Amount Rs. P., Total / Advance / Balance)

The shop's own details (name, GSTIN, address, phones, bank) come from Company Details in the app; the customer's
address and phone print only when they were entered with the order. The shop logo is drawn from
backend/app/assets/logo.png.
"""
import os
from io import BytesIO
from typing import Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.units import mm
from reportlab.lib.utils import simpleSplit
from reportlab.pdfgen import canvas

from app.models.company import CompanySettings
from app.models.customer import Customer
from app.models.invoice import Invoice
from app.models.product import Product
from app.services.pdf_service import amount_in_words

LOGO_PATH = os.path.join(os.path.dirname(__file__), "..", "assets", "logo.png")

LINE = colors.HexColor("#3b4a9c")
BAND = colors.HexColor("#3d4fa3")
TINT = colors.HexColor("#e9ebf7")
PAGE_TINT = colors.HexColor("#f4f3fb")
BRAND_RED = colors.HexColor("#c0392b")
INK = colors.HexColor("#111111")
GREY = colors.HexColor("#666666")


# ---- the shop's details ------------------------------------------------------
class Shop:
    """Company settings in the shape the bills need."""

    def __init__(self, company: Optional[CompanySettings]):
        c = company
        self.name = (c.name if c and c.name else "Sri Jayam Printers")
        self.tagline = c.tagline if c else None
        self.gstin = (c.gstin or "") if c else ""
        self.address = (c.address or "") if c else ""
        self.landline = (c.landline or "") if c else ""
        self.email = (c.email or "") if c else ""
        raw = (c.phones or "") if c else ""
        self.mobiles = [p.strip() for p in raw.replace(",", "/").split("/") if p.strip()]
        self.show_bank = bool(c.show_bank_on_invoice) if c else False
        self.bank_lines = []
        if c and c.show_bank_on_invoice and (c.bank_account_no or c.bank_name):
            self.bank_lines = [l for l in [
                c.bank_account_name or None,
                f"Ac.No.{c.bank_account_no}" if c.bank_account_no else None,
                f"IFSC Code : {c.bank_ifsc}" if c.bank_ifsc else None,
                " ".join(p for p in [(c.bank_name or "").upper(), (c.bank_branch or "").upper()] if p) or None,
            ] if l]


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


def _item_text(product: Optional[Product], item) -> tuple[str, str]:
    """(description, notes): the item name with the options chosen, and the free-form specification."""
    name = product.name if product else f"Product #{item.product_id}"
    values = []
    document_type = None
    for selected in getattr(item, "selected_options", None) or []:
        option = getattr(selected, "attribute_option", None)
        attribute = getattr(selected, "attribute", None)
        if option is None or not option.value:
            continue
        if attribute is not None and attribute.name == "Document Type":
            document_type = str(option.value)
        else:
            values.append(str(option.value))
    if document_type and name.startswith("Sheet Printing - "):
        # Bill books read as "Bill Book - 1/4 (80 GSM, 1+2 ...)" rather than the internal item name.
        name = f"{document_type} - {name[len('Sheet Printing - '):]}"
    description = f"{name} ({', '.join(values)})" if values else name
    return description, (getattr(item, "spec_notes", None) or "").strip()


def _particulars_lines(product: Optional[Product], item, font: str, size: float, width: float, max_lines: int) -> list[tuple[str, bool]]:
    """Wrapped (text, is_note) lines for a bill row: description first, then the specification if there is room."""
    description, notes = _item_text(product, item)
    lines = [(t, False) for t in simpleSplit(description, font, size, width)]
    if notes:
        lines += [(t, True) for t in simpleSplit(notes, "Helvetica-Oblique", size - 0.8, width)]
    if len(lines) > max_lines:
        lines = lines[:max_lines]
        text, is_note = lines[-1]
        lines[-1] = (text.rstrip()[:-1] + "…" if len(text) > 3 else text, is_note)
    return lines


def _draw_logo(c, x, y, w, h) -> bool:
    if os.path.exists(LOGO_PATH):
        c.drawImage(LOGO_PATH, x, y, width=w, height=h, preserveAspectRatio=True, anchor="sw", mask="auto")
        return True
    return False


def _draw_name(c, shop: Shop, x, y, w, h, size=22):
    """The shop logo in the box (x, y, w, h); falls back to the name in script lettering when there is no logo file."""
    if not _draw_logo(c, x, y, w, h):
        c.setFillColor(BRAND_RED)
        _fit(c, shop.name, x, y + h / 2 - 3, w, "Times-BoldItalic", size)
        c.setFillColor(INK)


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


def _serial(invoice: Invoice) -> str:
    """The number printed on the bill: the shop's own series (set under Company Details), else our reference."""
    return str(invoice.bill_no) if getattr(invoice, "bill_no", None) else invoice.invoice_number


def _customer_lines(customer: Customer, width: float, font_size: float) -> list[tuple[str, str, float]]:
    """(text, font, size) lines for the 'To' box: name, then address and phone only if they were entered."""
    lines = [(customer.name, "Helvetica-Bold", font_size + 1)]
    if customer.address:
        for l in simpleSplit(customer.address.replace("\n", ", "), "Helvetica", font_size, width)[:2]:
            lines.append((l, "Helvetica", font_size))
    if customer.phone:
        lines.append((f"Ph: {customer.phone}", "Helvetica", font_size))
    return lines


# =============================================================================
# 1) GST INVOICE  (A4 portrait)
# =============================================================================
GST_COLS_MM = [9, 46, 16, 11, 17, 20, 9, 15, 9, 15, 23]  # sums to 190mm
GST_ROWS_PER_PAGE = 15


def generate_gst_bill_pdf(invoice: Invoice, customer: Customer, products_by_id: dict[int, Product],
                          company: Optional[CompanySettings] = None) -> bytes:
    shop = Shop(company)
    fallback_rate = _tax_rate(invoice)
    rows = []
    for item in invoice.items:
        rate = float(item.tax_rate or 0.0)
        tax = float(item.tax_amount or 0.0)
        if not rate and not tax and not item.hsn_code and invoice.with_gst:
            # Older invoices carry one tax rate for the whole bill.
            rate = fallback_rate
            tax = round(item.total_price * rate / 100, 2)
        cgst = round(tax / 2, 2)
        rows.append({
            "product": products_by_id.get(item.product_id),
            "item": item,
            "rate": rate,
            "cgst_amt": cgst,
            "sgst_amt": round(tax - cgst, 2),
            "total": item.total_price + tax,
        })

    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    c.setTitle(f"Invoice {_serial(invoice)}")
    pages = _chunks(rows, GST_ROWS_PER_PAGE)
    for idx, chunk in enumerate(pages):
        _draw_gst_page(c, shop, invoice, customer, chunk, idx * GST_ROWS_PER_PAGE,
                       page_no=idx + 1, page_count=len(pages), is_last=(idx == len(pages) - 1))
        c.showPage()
    c.save()
    return buffer.getvalue()


def _draw_gst_page(c, shop, invoice, customer, chunk, start_index, page_no, page_count, is_last):
    W, H = A4
    m = 8 * mm
    pad = 2 * mm
    c.setFillColor(PAGE_TINT)
    c.rect(m, m, W - 2 * m, H - 2 * m, fill=1, stroke=0)
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
    logo_h = 31 * mm

    c.setLineWidth(0.8)
    c.setFillColor(colors.white)
    c.rect(x0, top - logo_h, left_w, logo_h, fill=1)                      # logo / name box
    c.rect(x0, header_bottom, left_w, header_h - logo_h, fill=1)          # "To" box
    c.setFillColor(INK)

    text_x = x0 + 3 * mm
    text_w = x0 + left_w - 3 * mm - text_x
    if shop.landline:
        _fit(c, f"Ph : {shop.landline}", text_x, top - 5 * mm, text_w, "Helvetica-Bold", 8.5, "right")
    _draw_name(c, shop, text_x, top - 19.5 * mm, text_w * 0.9, 17 * mm)
    for i, line in enumerate(simpleSplit(shop.address, "Helvetica-Bold", 7, text_w)[:2]):
        c.setFont("Helvetica-Bold", 7)
        c.drawCentredString(text_x + text_w / 2, top - 22.5 * mm - i * 3.2 * mm, line)
    if shop.email:
        _fit(c, f"Email : {shop.email}", text_x, top - 28.5 * mm, text_w, "Helvetica-Bold", 6.8, "center")

    # right-hand cells
    c.setFillColor(BAND)
    c.rect(right_x, top - band_h, right_w, band_h, fill=1, stroke=1)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 13)
    c.drawCentredString(right_x + right_w / 2, top - band_h + 2.8 * mm, "INVOICE")
    c.setFillColor(INK)
    cells = [
        ("GSTIN: ", shop.gstin),
        ("Sl.No.   ", _serial(invoice)),
        ("Date   ", invoice.invoice_date.strftime("%d.%m.%Y")),
        ("Mob. : ", " / ".join(shop.mobiles)),
        ("Party GSTIN: ", (customer.gstin or "").strip()),
    ]
    cy = top - band_h
    for i, (label, value) in enumerate(cells):
        c.setFillColor(colors.white)
        c.rect(right_x, cy - (i + 1) * cell_h, right_w, cell_h, fill=1)
        c.setFillColor(INK)
        base = cy - (i + 1) * cell_h + 2.7 * mm
        c.setFont("Helvetica", 8.5)
        c.drawString(right_x + 2 * mm, base, label)
        lw = c.stringWidth(label, "Helvetica", 8.5)
        _fit(c, value, right_x + 2 * mm + lw, base, right_w - 4 * mm - lw, "Helvetica-Bold", 8.5)

    # "To" box: name, then address / phone only when they were entered
    to_top = header_bottom + (header_h - logo_h)
    c.setFont("Helvetica", 8.5)
    c.drawString(x0 + 2 * mm, to_top - 5 * mm, "To.")
    for i, (txt, font, size) in enumerate(_customer_lines(customer, left_w - 16 * mm, 8)[:4]):
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

    c.setFillColor(colors.white)
    c.rect(x0, body_bottom, iw, body_top - body_bottom, fill=1, stroke=0)
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

    for i, row in enumerate(chunk):
        item = row["item"]
        row_top = body_top - i * row_h
        base = row_top - 3.8 * mm
        pct = f"{row['rate'] / 2:g}"
        c.setFillColor(INK)
        _fit(c, start_index + i + 1, xs[0], base, cols[0], "Helvetica", 8.5, "center")
        for k, (line, is_note) in enumerate(_particulars_lines(row["product"], item, "Helvetica", 7.4, cols[1] - 3 * mm, 3)):
            c.setFont("Helvetica-Oblique" if is_note else "Helvetica", 6.6 if is_note else 7.4)
            c.drawString(xs[1] + 1.5 * mm, base - k * 3.0 * mm, line)
        _fit(c, item.hsn_code or "", xs[2], base, cols[2], "Helvetica", 8, "center")
        _fit(c, item.quantity, xs[3], base, cols[3], "Helvetica", 8.5, "center")
        _fit(c, _money(item.unit_price), xs[4] + 1 * mm, base, cols[4] - 2.5 * mm, "Helvetica", 8.5, "right")
        _fit(c, _money(item.total_price), xs[5] + 1 * mm, base, cols[5] - 2.5 * mm, "Helvetica", 8.5, "right")
        _fit(c, pct if row["rate"] else "", xs[6], base, cols[6], "Helvetica", 8, "center")
        _fit(c, _money(row["cgst_amt"]), xs[7] + 1 * mm, base, cols[7] - 2.5 * mm, "Helvetica", 8.5, "right")
        _fit(c, pct if row["rate"] else "", xs[8], base, cols[8], "Helvetica", 8, "center")
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

    # bank details sit at the bottom of the (otherwise empty) table body, as on the client's sample
    if shop.bank_lines:
        by = body_bottom + 4 + 3.4 * mm * len(shop.bank_lines)
        c.setFillColor(INK)
        c.setFont("Helvetica", 7.5)
        c.drawString(xs[1] + 1.5 * mm, by, "Account Details")
        c.line(xs[1] + 1.5 * mm, by - 0.6 * mm, xs[1] + 1.5 * mm + c.stringWidth("Account Details", "Helvetica", 7.5), by - 0.6 * mm)
        for k, line in enumerate(shop.bank_lines):
            _fit(c, line, xs[1] + 1.5 * mm, by - (k + 1) * 3.4 * mm, cols[1] + cols[2] - 3 * mm, "Helvetica-Bold" if k == 0 else "Helvetica", 7.5)

    box_h = 8 * mm
    rb_w = 85 * mm
    rb_x = x1 - rb_w
    f_top = footer_bottom + footer_h
    c.setFillColor(colors.white)
    c.rect(x0, f_top - 4 * box_h, rb_x - x0, 4 * box_h, fill=1)
    c.setFillColor(INK)
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
        c.setFillColor(colors.white)
        c.rect(rb_x, y_row, label_w, box_h, fill=1)
        c.rect(rb_x + label_w, y_row, rb_w - label_w, box_h, fill=1)
        c.setFillColor(INK)
        font = "Helvetica-Bold" if bold else "Helvetica"
        _fit(c, label, rb_x, y_row + 2.6 * mm, label_w - 2 * mm, font, 8.5, "right")
        _fit(c, _money(value), rb_x + label_w, y_row + 2.6 * mm, rb_w - label_w - 2 * mm, font, 9, "right")

    c.setFont("Helvetica-Bold", 8)
    c.drawRightString(x1 - 58 * mm, footer_bottom + 3 * mm, "FOR")
    c.setFillColor(BRAND_RED)
    _fit(c, shop.name, x1 - 56 * mm, footer_bottom + 3 * mm, 56 * mm, "Times-BoldItalic", 15)


# =============================================================================
# 2) CASH BILL  (A4 landscape)
# =============================================================================
CASH_COLS_MM = [14, 150, 26, 38, 53]  # sums to 281mm
CASH_RS_MM = 40                       # width of the "Rs." half of the Amount column
CASH_ROWS_PER_PAGE = 9


def generate_cash_bill_pdf(invoice: Invoice, customer: Customer, products_by_id: dict[int, Product],
                           company: Optional[CompanySettings] = None) -> bytes:
    shop = Shop(company)
    rows = [{"product": products_by_id.get(item.product_id), "item": item} for item in invoice.items]
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=landscape(A4))
    c.setTitle(f"Cash Bill {_serial(invoice)}")
    pages = _chunks(rows, CASH_ROWS_PER_PAGE)
    for idx, chunk in enumerate(pages):
        _draw_cash_page(c, shop, invoice, customer, chunk, idx * CASH_ROWS_PER_PAGE,
                        page_no=idx + 1, page_count=len(pages), is_last=(idx == len(pages) - 1))
        c.showPage()
    c.save()
    return buffer.getvalue()


def _draw_cash_page(c, shop, invoice, customer, chunk, start_index, page_no, page_count, is_last):
    W, H = landscape(A4)
    m = 6 * mm
    pad = 2 * mm
    c.setFillColor(PAGE_TINT)
    c.rect(m, m, W - 2 * m, H - 2 * m, fill=1, stroke=0)
    c.setStrokeColor(LINE)
    c.setFillColor(INK)
    c.setLineWidth(1.2)
    c.rect(m, m, W - 2 * m, H - 2 * m)

    x0, x1 = m + pad, W - m - pad
    iw = x1 - x0
    top = H - m - pad

    # ---- header ------------------------------------------------------------
    left_w = 175 * mm
    right_x = x0 + left_w
    right_w = iw - left_w
    header_h = 34 * mm
    band_h = 10 * mm
    c.setLineWidth(0.8)
    c.setFillColor(colors.white)
    c.rect(x0, top - header_h, left_w, header_h, fill=1)

    c.setFillColor(INK)
    _fit(c, f"GSTIN : {shop.gstin}", x0 + 3 * mm, top - 5 * mm, left_w - 6 * mm, "Helvetica-Bold", 8.5, "right")
    if shop.email:
        _fit(c, f"Email : {shop.email}", x0 + 3 * mm, top - 9.2 * mm, left_w - 6 * mm, "Helvetica", 7.5, "right")
    _draw_name(c, shop, x0 + 4 * mm, top - 27.5 * mm, left_w * 0.72, 17.5 * mm)
    for i, line in enumerate(simpleSplit(shop.address, "Helvetica-Bold", 8, left_w - 8 * mm)[:2]):
        c.setFont("Helvetica-Bold", 8)
        c.drawString(x0 + 4 * mm, top - 29.5 * mm - i * 3.4 * mm, line)

    c.setFillColor(BAND)
    c.rect(right_x, top - band_h, right_w, band_h, fill=1, stroke=1)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 15)
    c.drawCentredString(right_x + right_w / 2, top - band_h + 3.2 * mm, "CASH BILL")
    c.setFillColor(colors.white)
    c.rect(right_x, top - header_h, right_w, header_h - band_h, fill=1)
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(right_x + 3 * mm, top - band_h - 6.5 * mm, "Mob :")
    for i, number in enumerate(shop.mobiles[:3]):
        c.drawString(right_x + 17 * mm, top - band_h - 6.5 * mm - i * 5.6 * mm, number)

    # ---- To / S.No. / Date -------------------------------------------------
    to_top = top - header_h
    to_h = 20 * mm
    c.setFillColor(colors.white)
    c.rect(x0, to_top - to_h, left_w, to_h, fill=1)
    c.rect(right_x, to_top - to_h, right_w, to_h, fill=1)
    c.setFillColor(INK)
    c.setFont("Helvetica", 9.5)
    c.drawString(x0 + 3 * mm, to_top - 6 * mm, "To")
    for i, (txt, font, size) in enumerate(_customer_lines(customer, left_w - 18 * mm, 8.5)[:4]):
        _fit(c, txt, x0 + 12 * mm, to_top - 6 * mm - i * 4.4 * mm, left_w - 15 * mm, font, size)
    c.setFont("Helvetica", 9.5)
    c.drawString(right_x + 3 * mm, to_top - 7 * mm, "S.No.:")
    _fit(c, _serial(invoice), right_x + 18 * mm, to_top - 7 * mm, right_w - 21 * mm, "Helvetica-Bold", 13)
    c.setFont("Helvetica", 9.5)
    c.drawString(right_x + 3 * mm, to_top - 15 * mm, "Date :")
    _fit(c, invoice.invoice_date.strftime("%d-%m-%Y"), right_x + 18 * mm, to_top - 15 * mm, right_w - 21 * mm, "Helvetica-Bold", 11)

    # ---- items table -------------------------------------------------------
    cols = [w * mm for w in CASH_COLS_MM]
    xs = [x0]
    for w in cols:
        xs.append(xs[-1] + w)
    rs_w = CASH_RS_MM * mm

    table_top = to_top - to_h - 2 * mm
    head_h = 9 * mm
    body_top = table_top - head_h
    bottom_block_h = 15 * mm
    box_h = 8 * mm
    totals_h = 3 * box_h
    body_bottom = m + pad + bottom_block_h + 2 * mm + totals_h
    row_h = (body_top - body_bottom) / CASH_ROWS_PER_PAGE

    c.setFillColor(colors.white)
    c.rect(x0, body_bottom, iw, body_top - body_bottom, fill=1, stroke=0)
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

    def head(text, i, y, size=8.5, font="Helvetica-Bold"):
        c.setFont(font, size)
        c.drawCentredString((xs[i] + xs[i + 1]) / 2, y, text)

    mid_y = body_top + head_h / 2 - 1.3 * mm
    head("S.No.", 0, mid_y, 8)
    head("P A R T I C U L A R S", 1, mid_y, 9)
    head("Qty", 2, mid_y, 9)
    head("Rate", 3, mid_y, 9)
    head("Amount", 4, body_top + head_h - 3.6 * mm, 8)
    c.setFont("Helvetica-Bold", 8)
    c.drawCentredString(xs[4] + rs_w / 2, body_top + 1.5 * mm, "Rs.")
    c.drawCentredString(xs[4] + rs_w + (cols[4] - rs_w) / 2, body_top + 1.5 * mm, "P.")

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
        base = row_top - 4.6 * mm
        c.setFillColor(INK)
        _fit(c, start_index + i + 1, xs[0], base, cols[0], "Helvetica", 9.5, "center")
        for k, (line, is_note) in enumerate(_particulars_lines(row["product"], item, "Helvetica", 9, cols[1] - 4 * mm, 2)):
            c.setFont("Helvetica-Oblique" if is_note else "Helvetica", 7.8 if is_note else 9)
            c.drawString(xs[1] + 2 * mm, base - k * 3.9 * mm, line)
        _fit(c, item.quantity, xs[2], base, cols[2], "Helvetica", 9.5, "center")
        _fit(c, _money(item.unit_price), xs[3], base, cols[3] - 3 * mm, "Helvetica", 9.5, "right")
        rs, p = _rs_p(item.total_price)
        _fit(c, rs, xs[4], base, rs_w - 3 * mm, "Helvetica-Bold", 10, "right")
        _fit(c, p, xs[4] + rs_w, base, cols[4] - rs_w, "Helvetica", 9.5, "center")

    # ---- footer: Total / Advance / Balance + Rupees / For ------------------
    bottom_y = m + pad
    if page_count > 1:
        c.setFillColor(GREY)
        c.setFont("Helvetica", 7)
        c.drawString(x0 + 1 * mm, body_bottom - 4 * mm, f"Page {page_no} of {page_count}")
    if not is_last:
        c.setFillColor(GREY)
        c.setFont("Helvetica-Oblique", 8.5)
        c.drawRightString(x1 - 2 * mm, body_bottom - 6 * mm, "Continued on next page...")
        return

    total = invoice.subtotal
    advance = invoice.amount_paid or 0.0
    balance = max(total - advance, 0.0)
    c.setFillColor(colors.white)
    c.rect(x0, body_bottom - totals_h, xs[2] - x0, totals_h, fill=1)
    for i, (label, value, bold) in enumerate([("Total", total, True), ("Advance", advance, False), ("Balance", balance, True)]):
        y_row = body_bottom - (i + 1) * box_h
        c.setFillColor(colors.white)
        c.rect(xs[2], y_row, xs[4] - xs[2], box_h, fill=1)
        c.rect(xs[4], y_row, rs_w, box_h, fill=1)
        c.rect(xs[4] + rs_w, y_row, cols[4] - rs_w, box_h, fill=1)
        c.setFillColor(INK)
        font = "Helvetica-Bold" if bold else "Helvetica"
        _fit(c, label, xs[2], y_row + 2.5 * mm, xs[4] - xs[2] - 4 * mm, font, 10, "right")
        rs, p = _rs_p(value)
        _fit(c, rs, xs[4], y_row + 2.5 * mm, rs_w - 3 * mm, font, 10.5, "right")
        _fit(c, p, xs[4] + rs_w, y_row + 2.5 * mm, cols[4] - rs_w, font, 9.5, "center")

    bb_top = bottom_y + bottom_block_h
    c.setFillColor(colors.white)
    c.rect(x0, bottom_y, left_w, bottom_block_h, fill=1)
    c.rect(right_x, bottom_y, right_w, bottom_block_h, fill=1)
    c.setFillColor(INK)
    c.setFont("Helvetica", 8)
    c.drawString(x0 + 3 * mm, bb_top - 5 * mm, "Rupees")
    words = _strip_rupees(amount_in_words(total))
    for k, line in enumerate(simpleSplit(words, "Helvetica-Oblique", 9, left_w - 24 * mm)[:2]):
        c.setFont("Helvetica-Oblique", 9)
        c.drawString(x0 + 17 * mm, bb_top - 5 * mm - k * 4.4 * mm, line)
    c.setFont("Helvetica-Bold", 8.5)
    c.drawString(right_x + 3 * mm, bottom_y + 5.5 * mm, "For")
    c.setFillColor(BRAND_RED)
    _fit(c, shop.name, right_x + 11 * mm, bottom_y + 5.5 * mm, right_w - 14 * mm, "Times-BoldItalic", 13)
