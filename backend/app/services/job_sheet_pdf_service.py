"""The paper job card as a landscape A4 print: the same form the staff fill on screen, but only the parts that belong to
the job's service (a Xerox job has no ink colours, margins, proofs or 1st/2nd copy rows). Without prices the payment
column is left off; with prices it carries the bill total, advance, balance and the price list of the order."""
from io import BytesIO
from typing import Any, Dict, List, Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.units import mm
from reportlab.lib.utils import simpleSplit
from reportlab.pdfgen import canvas

from app.models.company import CompanySettings
from app.services.bill_pdf_service import BAND, BRAND_RED, GREY, INK, LINE, TINT, Shop, _draw_logo, _fit
from app.services.job_sheet_service import COLOUR_NAMES, MARGIN_NAMES

PAYMENT_LABELS = {"first": "Bill total", "rate": "Rate", "advance": "Advance paid", "balance1": "Balance"}


def _date(value) -> str:
    text = str(value or "")
    return "/".join(reversed(text.split("-"))) if len(text) == 10 and text[4] == "-" else text


def generate_job_sheet_pdf(meta: Dict[str, Any], company: Optional[CompanySettings] = None, with_price: bool = False) -> bytes:
    shop = Shop(company)
    sheet = meta["sheet"]
    profile = meta.get("profile") or {}
    labels = profile.get("paper_labels") or {}
    buffer = BytesIO()
    W, H = landscape(A4)
    c = canvas.Canvas(buffer, pagesize=(W, H))
    c.setTitle(f"Job card {meta['job_number']}")
    m = 8 * mm
    x0, x1 = m, W - m
    top = H - m
    c.setStrokeColor(LINE)
    c.setFillColor(INK)
    c.setLineWidth(1.4)
    c.rect(x0, m, x1 - x0, top - m)
    c.setLineWidth(0.7)

    def hline(y, xa=x0, xb=x1):
        c.line(xa, y, xb, y)

    def vline(x, ya, yb):
        c.line(x, ya, x, yb)

    def box(x, y, ticked, size=3.2 * mm):
        c.rect(x, y, size, size)
        if ticked:
            c.setLineWidth(1.3)
            c.line(x + 0.5 * mm, y + size / 2, x + size / 2.3, y + 0.6 * mm)
            c.line(x + size / 2.3, y + 0.6 * mm, x + size + 0.6 * mm, y + size + 0.8 * mm)
            c.setLineWidth(0.7)

    def checks(options: List[str], ticked: List[str], x, y, width, per_row=None, size=8.0, gap=2 * mm):
        """Tick boxes in a wrapped row starting at (x, y); returns the y below the last row."""
        cx, cy = x, y
        for opt in options:
            w = 5 * mm + c.stringWidth(opt, "Helvetica", size) + gap
            if per_row is None and cx + w > x + width and cx > x:
                cx, cy = x, cy - 5 * mm
            box(cx, cy - 0.6 * mm, opt in ticked)
            c.setFont("Helvetica", size)
            c.drawString(cx + 4.4 * mm, cy, opt)
            cx += w
        return cy

    # ---- header -------------------------------------------------------------
    hh = 17 * mm
    if not _draw_logo(c, x0 + 3 * mm, top - hh + 2 * mm, 62 * mm, hh - 4 * mm):
        c.setFillColor(BRAND_RED)
        _fit(c, shop.name, x0 + 3 * mm, top - 11 * mm, 70 * mm, "Times-BoldItalic", 20)
        c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 17)
    title_x = (x0 + x1) / 2
    c.drawCentredString(title_x, top - 9 * mm, "JOB CARD")
    c.line(title_x - 19 * mm, top - 10.2 * mm, title_x + 19 * mm, top - 10.2 * mm)
    c.setFont("Helvetica", 8)
    c.drawCentredString(title_x, top - 14.5 * mm, shop.name + (" - " + (shop.address.split(",")[-1].strip() if shop.address else "")))
    c.setFont("Helvetica-Bold", 12)
    c.drawRightString(x1 - 3 * mm, top - 6.5 * mm, f"No: {meta.get('invoice_number') or meta['job_number']}")
    c.setFont("Helvetica", 8.5)
    when = f"Date: {_date(meta.get('invoice_date')) or '-'}    Time: {meta.get('invoice_time') or '-'}"
    c.drawRightString(x1 - 3 * mm, top - 11.5 * mm, when)
    c.setFont("Helvetica", 7.5)
    c.setFillColor(GREY)
    c.drawRightString(x1 - 3 * mm, top - 15.5 * mm, f"Job {meta['job_number']}")
    c.setFillColor(INK)
    y = top - hh
    hline(y)

    # ---- party / job ------------------------------------------------------------
    rh = 15 * mm
    half = (x0 + x1) / 2
    vline(half, y, y - rh)
    for i, (label, key) in enumerate([("Party Name", "party_name"), ("Mobile", "mobile")]):
        c.setFont("Helvetica-Bold", 8.5)
        c.drawString(x0 + 3 * mm, y - 5.5 * mm - i * 6 * mm, f"{label} :")
        _fit(c, sheet.get(key, ""), x0 + 28 * mm, y - 5.5 * mm - i * 6 * mm, half - x0 - 31 * mm, "Helvetica", 9.5)
    for i, (label, key) in enumerate([("Job Name", "job_name"), ("Size", "size")]):
        c.setFont("Helvetica-Bold", 8.5)
        c.drawString(half + 3 * mm, y - 5.5 * mm - i * 6 * mm, f"{label} :")
        _fit(c, sheet.get(key, ""), half + 25 * mm, y - 5.5 * mm - i * 6 * mm, x1 - half - 28 * mm, "Helvetica", 9.5)
    y -= rh
    hline(y)

    # ---- type of printing (only the types of this service) -------------------------
    if profile.get("type_options"):
        c.setFont("Helvetica-Bold", 8.5)
        c.drawString(x0 + 3 * mm, y - 5.2 * mm, "Type of Printing :")
        checks(profile["type_options"], sheet.get("type_of_printing") or [], x0 + 34 * mm, y - 5.2 * mm, x1 - x0 - 40 * mm)
        y -= 8 * mm
        hline(y)

    # ---- body ------------------------------------------------------------------------
    pay_w = 66 * mm if with_price else 0
    body_x1 = x1 - pay_w
    pos_h = 14 * mm
    body_bottom = m + pos_h
    # left column: proofs + delivery
    proof_w = 50 * mm
    vline(x0 + proof_w, y, body_bottom)
    py = y - 5 * mm
    if profile.get("show_proofs"):
        c.setFont("Helvetica-Bold", 8.5)
        c.drawString(x0 + 3 * mm, py, "Proof Date - Time")
        py -= 5 * mm
        rows = [("Proof 1", sheet.get("proof1_date"), sheet.get("proof1_time")), ("Proof 2", sheet.get("proof2_date"), sheet.get("proof2_time"))]
        for n, extra in enumerate(sheet.get("more_proofs") or [], start=3):
            rows.append((f"Proof {n}", (extra or {}).get("date"), (extra or {}).get("time")))
        # always leave a few empty lines to write further proofs by hand
        while len(rows) < 5:
            rows.append((f"Proof {len(rows) + 1}", "", ""))
        for label, d, t in rows[:7]:
            c.setFont("Helvetica", 7.5)
            c.setFillColor(GREY)
            c.drawString(x0 + 3 * mm, py, label)
            c.setFillColor(INK)
            c.setFont("Helvetica-Bold", 8.5)
            c.drawString(x0 + 17 * mm, py, f"{_date(d)} {t or ''}".strip())
            c.setStrokeColor(colors.HexColor("#9aa3d6"))
            c.line(x0 + 16 * mm, py - 1.2 * mm, x0 + proof_w - 3 * mm, py - 1.2 * mm)
            c.setStrokeColor(LINE)
            py -= 5.2 * mm
        py -= 2 * mm
    c.setFont("Helvetica-Bold", 8.5)
    c.drawString(x0 + 3 * mm, py, "Delivery Date - Time")
    py -= 6 * mm
    c.setFont("Helvetica-Bold", 11)
    c.drawString(x0 + 3 * mm, py, f"{_date(sheet.get('delivery_date')) or '-'}  {sheet.get('delivery_time') or ''}".strip())

    # middle: paper details table
    mx0 = x0 + proof_w
    c.setFillColor(TINT)
    c.rect(mx0, y - 6 * mm, body_x1 - mx0, 6 * mm, fill=1, stroke=0)
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 9)
    c.drawCentredString((mx0 + body_x1) / 2, y - 4.2 * mm, "Paper Details")
    hline(y - 6 * mm, mx0, body_x1)
    cols = ["range", "kgs", "colour", "qty"]
    if profile.get("show_cutting"):
        cols.append("cutting")
    cols.append("printing")
    cols = [k for k in cols if k == "cutting" or labels.get(k, "x")]
    widths_rel = {"range": 1.5, "kgs": 0.8, "colour": 1.0, "qty": 1.0, "cutting": 1.0, "printing": 1.4}
    tw = body_x1 - mx0 - (24 * mm if profile.get("copy_rows", 1) > 1 else 0)
    start_x = mx0 + (24 * mm if profile.get("copy_rows", 1) > 1 else 0)
    total_rel = sum(widths_rel[k] for k in cols)
    xs = [start_x]
    for k in cols:
        xs.append(xs[-1] + tw * widths_rel[k] / total_rel)
    head_y = y - 6 * mm
    c.setFillColor(TINT)
    c.rect(mx0, head_y - 6 * mm, body_x1 - mx0, 6 * mm, fill=1, stroke=0)
    c.setFillColor(INK)
    for i, k in enumerate(cols):
        label = "Cutting Size" if k == "cutting" else labels.get(k, k)
        c.setFont("Helvetica-Bold", 8)
        c.drawCentredString((xs[i] + xs[i + 1]) / 2, head_y - 4.2 * mm, label)
    hline(head_y - 6 * mm, mx0, body_x1)
    paper = sheet.get("paper") or []
    n_rows = max(len(paper), 1)
    row_h = 8 * mm
    ry = head_y - 6 * mm
    copy_names = ["1st Copy", "2nd Copy", "3rd Copy", "4th Copy"]
    for r in range(n_rows):
        row = paper[r] if r < len(paper) else {}
        if profile.get("copy_rows", 1) > 1:
            c.setFont("Helvetica", 8)
            c.setFillColor(GREY)
            c.drawString(mx0 + 2 * mm, ry - 5.2 * mm, copy_names[r])
            c.setFillColor(INK)
        for i, k in enumerate(cols):
            value = sheet.get("cutting_size", "") if k == "cutting" else row.get(k, "")
            if k == "cutting" and r > 0:
                continue
            _fit(c, value, xs[i] + 1.5 * mm, ry - 5.2 * mm, xs[i + 1] - xs[i] - 3 * mm, "Helvetica", 9)
        ry -= row_h
        hline(ry, mx0, body_x1)
    for xv in xs[1:-1]:
        vline(xv, head_y, ry)
    if profile.get("copy_rows", 1) > 1:
        vline(start_x, head_y, ry)

    # colours / margin / numbering (only where the service has them), then remarks
    sy = ry
    blocks = []
    if profile.get("show_colours"):
        blocks.append(("Printing Colour", "colours"))
    if profile.get("show_margin"):
        blocks.append(("Margin", "margin"))
    if profile.get("show_numbering"):
        blocks.append(("No Details", "numbering"))
    if blocks:
        bw = (body_x1 - mx0) / len(blocks)
        bh = 22 * mm
        for i, (title, kind) in enumerate(blocks):
            bx = mx0 + i * bw
            c.setFillColor(TINT)
            c.rect(bx, sy - 6 * mm, bw, 6 * mm, fill=1, stroke=0)
            c.setFillColor(INK)
            c.setFont("Helvetica-Bold", 8.5)
            c.drawCentredString(bx + bw / 2, sy - 4.2 * mm, title)
            if kind == "colours":
                checks(COLOUR_NAMES, sheet.get("printing_colours") or [], bx + 3 * mm, sy - 10.5 * mm, bw - 5 * mm, size=7.5)
            elif kind == "margin":
                checks(MARGIN_NAMES, sheet.get("margins") or [], bx + 3 * mm, sy - 10.5 * mm, bw - 5 * mm, size=7.5)
            else:
                c.setFont("Helvetica", 7.5)
                c.setFillColor(GREY)
                c.drawString(bx + 3 * mm, sy - 10.5 * mm, "Serial No. From - To")
                c.setFillColor(INK)
                _fit(c, sheet.get("serial_from_to", ""), bx + 3 * mm, sy - 14 * mm, bw - 6 * mm, "Helvetica-Bold", 8.5)
                c.setFont("Helvetica", 7.5)
                c.setFillColor(GREY)
                c.drawString(bx + 3 * mm, sy - 18 * mm, "Book No. From - To")
                c.setFillColor(INK)
                _fit(c, sheet.get("book_from_to", ""), bx + 3 * mm, sy - 21.2 * mm, bw - 6 * mm, "Helvetica-Bold", 8.5)
            if i:
                vline(bx, sy, sy - bh)
        sy -= bh
        hline(sy, mx0, body_x1)
    c.setFont("Helvetica-Bold", 8.5)
    c.drawString(mx0 + 3 * mm, sy - 5 * mm, "Remarks :")
    ty = sy - 10 * mm
    for raw in (sheet.get("remarks") or "").splitlines():
        for line in simpleSplit(raw, "Helvetica", 8.5, body_x1 - mx0 - 8 * mm) or [""]:
            if ty < body_bottom + 3 * mm:
                break
            c.setFont("Helvetica", 8.5)
            c.drawString(mx0 + 4 * mm, ty, line)
            ty -= 4.2 * mm

    # right: payment column (only on the copy with prices)
    if with_price:
        vline(body_x1, y, body_bottom)
        c.setFillColor(TINT)
        c.rect(body_x1, y - 6 * mm, pay_w, 6 * mm, fill=1, stroke=0)
        c.setFillColor(INK)
        c.setFont("Helvetica-Bold", 9)
        c.drawCentredString(body_x1 + pay_w / 2, y - 4.2 * mm, "Payment Details")
        hline(y - 6 * mm, body_x1, x1)
        py = y - 6 * mm
        pay = sheet.get("payment") or {}
        for key in profile.get("payment_keys") or ["first", "rate", "advance", "balance1"]:
            py -= 7 * mm
            c.setFont("Helvetica-Bold", 8.5)
            c.drawString(body_x1 + 2.5 * mm, py + 2.3 * mm, PAYMENT_LABELS.get(key, key))
            _fit(c, pay.get(key, ""), body_x1 + 26 * mm, py + 2.3 * mm, pay_w - 28 * mm, "Helvetica", 9, "right")
            hline(py, body_x1, x1)
        lines = meta.get("price_lines") or []
        if lines:
            py -= 5 * mm
            c.setFont("Helvetica-Bold", 8)
            c.drawString(body_x1 + 2.5 * mm, py, "Price list")
            py -= 4.6 * mm
            for ln in lines:
                if py < body_bottom + 4 * mm:
                    break
                c.setFont("Helvetica", 7.6)
                _fit(c, ln["label"], body_x1 + 2.5 * mm, py, pay_w - 25 * mm, "Helvetica", 7.6)
                _fit(c, f"{ln['amount']:,.2f}", body_x1 + pay_w - 24 * mm, py, 21.5 * mm, "Helvetica-Bold", 7.8, "right")
                py -= 4.2 * mm

    # ---- job position + DC / bill numbers -------------------------------------------------
    hline(body_bottom)
    c.setFont("Helvetica-Bold", 8.5)
    c.drawString(x0 + 3 * mm, body_bottom - 5.4 * mm, "Job Position :")
    ticked = sheet.get("job_position") or []
    checks(profile.get("position_options") or [], ticked, x0 + 28 * mm, body_bottom - 5.4 * mm, x1 - x0 - 90 * mm, size=7.8)
    vline(x1 - 55 * mm, body_bottom, m)
    c.setFont("Helvetica", 8.5)
    c.drawString(x1 - 52 * mm, body_bottom - 5.4 * mm, "DC No. :")
    c.setFont("Helvetica-Bold", 9)
    c.drawString(x1 - 36 * mm, body_bottom - 5.4 * mm, str(meta.get("dc_number") or "-"))
    c.setFont("Helvetica", 8.5)
    c.drawString(x1 - 52 * mm, body_bottom - 10.5 * mm, "Bill No. :")
    c.setFont("Helvetica-Bold", 9)
    c.drawString(x1 - 36 * mm, body_bottom - 10.5 * mm, str(meta.get("invoice_number") or "-"))
    c.save()
    return buffer.getvalue()
