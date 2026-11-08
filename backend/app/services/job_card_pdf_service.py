"""Printable job card (A4): the live status, every choice made for the job, the copies of the set, extras, proofs and the
production steps - with or without prices. Built from job_card_detail, so it is always up to date when printed."""
from io import BytesIO
from typing import Any, Dict, Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import simpleSplit
from reportlab.pdfgen import canvas

from app.models.company import CompanySettings
from app.services.bill_pdf_service import BAND, BRAND_RED, GREY, INK, LINE, TINT, Shop, _draw_logo, _fit
from app.services.time_utils import now_ist, utc_naive_to_ist

STEP_STATUS_LABEL = {
    "waiting": "Waiting", "ready": "Ready to start", "in_progress": "In progress",
    "on_hold": "On hold", "done": "Done", "skipped": "Skipped",
}
GREEN = colors.HexColor("#1b7a3a")
AMBER = colors.HexColor("#b26a00")


def _date(value) -> str:
    return value.strftime("%d %b %Y") if value else ""


def _dt(value) -> str:
    return utc_naive_to_ist(value).strftime("%d %b %H:%M") if value else ""


def generate_job_card_pdf(detail: Dict[str, Any], company: Optional[CompanySettings] = None) -> bytes:
    shop = Shop(company)
    with_price = bool(detail.get("with_price"))
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    c.setTitle(f"Job card {detail['job_number']}")
    W, H = A4
    left, right = 12 * mm, W - 12 * mm
    width = right - left
    bottom = 16 * mm
    state = {"y": H - 12 * mm, "page": 1}

    def footer():
        c.setFillColor(GREY)
        c.setFont("Helvetica", 7)
        stamp = now_ist().strftime("%d %b %Y %I:%M %p")
        c.drawString(left, 9 * mm, f"Job card {detail['job_number']} - status as on {stamp}" + ("" if with_price else " - prices not shown"))
        c.drawRightString(right, 9 * mm, f"Page {state['page']}")

    def new_page():
        footer()
        c.showPage()
        state["page"] += 1
        state["y"] = H - 14 * mm

    def need(height: float):
        if state["y"] - height < bottom:
            new_page()

    # ---- header -------------------------------------------------------------
    top = state["y"]
    if not _draw_logo(c, left, top - 15 * mm, 70 * mm, 15 * mm):
        c.setFillColor(BRAND_RED)
        _fit(c, shop.name, left, top - 10 * mm, 80 * mm, "Times-BoldItalic", 22)
    c.setFillColor(BAND)
    c.rect(right - 62 * mm, top - 11 * mm, 62 * mm, 11 * mm, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 15)
    c.drawCentredString(right - 31 * mm, top - 8 * mm, "JOB CARD")
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 13)
    c.drawRightString(right, top - 17 * mm, detail["job_number"])
    c.setFont("Helvetica", 8)
    refs = []
    if detail.get("invoice_number"):
        refs.append(f"Invoice {detail['bill_no'] or detail['invoice_number']}")
    if detail.get("order_number"):
        refs.append(f"Order {detail['order_number']}")
    c.drawRightString(right, top - 21.5 * mm, "  |  ".join(refs) if refs else "No invoice yet")
    state["y"] = top - 25 * mm

    # ---- urgent + status banner ---------------------------------------------
    now_with = detail["now_with"]
    banner_h = 13 * mm
    if detail["urgent"]:
        c.setFillColor(BRAND_RED)
        c.rect(left, state["y"] - 8 * mm, width, 8 * mm, fill=1, stroke=0)
        c.setFillColor(colors.white)
        c.setFont("Helvetica-Bold", 12)
        c.drawCentredString(left + width / 2, state["y"] - 5.7 * mm, "URGENT  -  HANDLE FIRST")
        state["y"] -= 10 * mm
    c.setFillColor(TINT)
    c.setStrokeColor(LINE)
    c.rect(left, state["y"] - banner_h, width, banner_h, fill=1, stroke=1)
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(left + 3 * mm, state["y"] - 5 * mm, f"STATUS: {detail['status_label'].upper()}")
    c.setFont("Helvetica", 8.5)
    now_text = "Delivered" if detail["status"] == "delivered" else (
        f"Now with: {now_with['person'] or now_with['work_center'] or '-'}"
        + (f"  ({now_with['step']})" if now_with["step"] else "")
    )
    c.drawString(left + 3 * mm, state["y"] - 10 * mm, now_text)
    prog = detail["progress"]
    c.setFont("Helvetica-Bold", 9)
    c.drawRightString(right - 3 * mm, state["y"] - 5 * mm, f"Step {min(prog['done'] + 1, prog['total'])} of {prog['total']}" if detail["status"] != "delivered" else f"{prog['total']} of {prog['total']} steps done")
    c.setFont("Helvetica", 8.5)
    due = f"Delivery: {_date(detail['delivery_date']) or '-'}{(' ' + detail['delivery_time']) if detail.get('delivery_time') else ''}"
    if detail["overdue"]:
        c.setFillColor(BRAND_RED)
        due += "  (OVERDUE)"
    c.drawRightString(right - 3 * mm, state["y"] - 10 * mm, due)
    state["y"] -= banner_h + 3 * mm

    def section(title: str):
        need(16 * mm)
        state["y"] -= 2.5 * mm
        c.setFillColor(BAND)
        c.rect(left, state["y"] - 5.5 * mm, width, 5.5 * mm, fill=1, stroke=0)
        c.setFillColor(colors.white)
        c.setFont("Helvetica-Bold", 8.5)
        c.drawString(left + 2 * mm, state["y"] - 4 * mm, title.upper())
        state["y"] -= 7 * mm

    def kv_rows(rows, label_w=46 * mm, size=9):
        for label, value in rows:
            lines = simpleSplit(str(value) if value not in (None, "") else "-", "Helvetica-Bold", size, width - label_w - 4 * mm) or ["-"]
            h = max(5.2 * mm, len(lines) * 4.2 * mm + 1.4 * mm)
            need(h)
            c.setFillColor(GREY)
            c.setFont("Helvetica", size - 0.5)
            c.drawString(left + 2 * mm, state["y"] - 4 * mm, f"{label}")
            c.setFillColor(INK)
            c.setFont("Helvetica-Bold", size)
            for i, line in enumerate(lines):
                c.drawString(left + label_w, state["y"] - 4 * mm - i * 4.2 * mm, line)
            c.setStrokeColor(colors.HexColor("#d5d9ee"))
            c.setLineWidth(0.3)
            c.line(left, state["y"] - h, right, state["y"] - h)
            state["y"] -= h

    def table(headers, widths_mm, rows, size=8.2, bold_first=False):
        widths = [w * mm for w in widths_mm]
        need(6 * mm + 5.5 * mm)
        c.setFillColor(TINT)
        c.rect(left, state["y"] - 5.5 * mm, width, 5.5 * mm, fill=1, stroke=0)
        c.setFillColor(INK)
        c.setFont("Helvetica-Bold", size)
        x = left
        for head, w in zip(headers, widths):
            c.drawString(x + 1.5 * mm, state["y"] - 4 * mm, head)
            x += w
        state["y"] -= 5.5 * mm
        for row in rows:
            cells = []
            height = 5.2 * mm
            for i, (value, w) in enumerate(zip(row, widths)):
                text = value[0] if isinstance(value, tuple) else value
                lines = simpleSplit(str(text) if text not in (None, "") else "-", "Helvetica", size, w - 3 * mm) or ["-"]
                cells.append((lines, value[1] if isinstance(value, tuple) else INK))
                height = max(height, len(lines) * 3.8 * mm + 1.6 * mm)
            need(height)
            x = left
            for i, ((lines, colour), w) in enumerate(zip(cells, widths)):
                c.setFillColor(colour)
                c.setFont("Helvetica-Bold" if (bold_first and i == 0) else "Helvetica", size)
                for k, line in enumerate(lines):
                    c.drawString(x + 1.5 * mm, state["y"] - 3.9 * mm - k * 3.8 * mm, line)
                x += w
            c.setStrokeColor(colors.HexColor("#d5d9ee"))
            c.setLineWidth(0.3)
            c.line(left, state["y"] - height, right, state["y"] - height)
            state["y"] -= height

    # ---- customer & job -----------------------------------------------------
    section("Customer and job")
    customer = detail["customer"]
    job = detail["job"]
    kv_rows([
        ("Customer", customer["name"] + (f"  (attn: {customer['billing_person']})" if customer.get("billing_person") and customer["billing_person"] != customer["name"] else "")),
        ("Phone", " / ".join(p for p in [customer.get("phone"), customer.get("whatsapp")] if p) or "-"),
        ("Service", job["service"] or "-"),
        ("Item", job["item"]),
        ("Quantity", f"{job['quantity']:,}" + (f"   ({job['sets']} sets)" if job.get("sets") and job["sets"] > 1 else "") if job["quantity"] else "-"),
    ] + ([("Area", f"{job['area_sqft']:g} sq ft each")] if job.get("area_sqft") else []))

    # ---- specification ------------------------------------------------------
    if detail["specs"]:
        section("Specification")
        kv_rows([(s["label"], s["value"]) for s in detail["specs"]])
    if detail["copies"]:
        section(f"Copies of the set ({len(detail['copies'])} copies)")
        table(["Copy", "Paper name", "GSM / grade", "Paper size", "Colour"], [30, 52, 38, 36, 30],
              [[f"{r['copy']}. {r['name']}", r["paper"], r["gsm"], r["size"], r["colour"]] for r in detail["copies"]], bold_first=True)
    if detail["extras"]:
        section("Finishing and extras")
        table(["Section", "Choice"] + (["Charge"] if with_price else []), [60, 100, 26] if with_price else [60, 126],
              [[e["group"], e["name"]] + ([f"{e['amount']:,.2f}"] if with_price else []) for e in detail["extras"]])
    if detail["notes"]:
        section("Instructions / details")
        kv_rows([(f"{i + 1}.", n) for i, n in enumerate(detail["notes"])], label_w=8 * mm)

    # ---- proofs -------------------------------------------------------------
    section("Design proofs")
    if detail["proofs"]:
        table(["Proof", "Due", "Status", "Looked after by"], [26, 50, 50, 60],
              [[p["label"], f"{_date(p['due_date'])} {p['due_time'] or ''}".strip() or "-",
                (p["status_label"] + ("  (late)" if p["overdue"] else ""), BRAND_RED if p["overdue"] else (GREEN if p["status"] == "approved" else INK)),
                p["handled_by_name"] or "Design team"] for p in detail["proofs"]], bold_first=True)
    else:
        kv_rows([("Proofs", "None planned")])

    # ---- production steps ---------------------------------------------------
    section("Production steps")
    table(["#", "Step", "Team / person", "Status", "Finished"], [8, 56, 50, 36, 36],
          [[str(n), s["name"] + (" (outside)" if s["kind"] == "outsource" else ""),
            (s["assigned_to_name"] or s["work_center_name"] or "-"),
            (STEP_STATUS_LABEL.get(s["status"], s["status"]), GREEN if s["status"] == "done" else (AMBER if s["status"] in ("in_progress", "on_hold") else INK)),
            _dt(s["completed_at"])] for n, s in enumerate(detail["steps"], start=1)])

    # ---- price --------------------------------------------------------------
    if with_price and detail.get("price"):
        price = detail["price"]
        section("Price")
        rows = [[b["label"], b["detail"], f"{b['amount']:,.2f}"] for b in price["breakdown"]]
        if rows:
            table(["Part", "How it is worked out", "Amount"], [48, 106, 32], rows)
        kv_rows([("Rate per piece", f"Rs. {price['rate']:,.2f}"), ("Amount", f"Rs. {price['amount']:,.2f}")]
                + ([("Order discount (this job's share)", f"- Rs. {price['discount']:,.2f}")] if price["discount"] else [])
                + ([("GST", f"Rs. {price['tax']:,.2f}")] if price["with_gst"] and price["tax"] else []))

    footer()
    c.save()
    return buffer.getvalue()
