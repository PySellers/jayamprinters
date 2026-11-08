"""The job card as the shop floor needs it: built from the order on the fly, so it always shows every choice that
was made for the job (paper, GSM of every copy, size, colours, binding, numbering, extras ...), the live status,
the proofs and who has the job now. Used by the on-screen job card and the printable PDF (with or without prices)."""
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.models.attribute import Attribute, AttributeOption
from app.models.delivery_challan import DeliveryChallan
from app.models.invoice import Invoice
from app.models.job_card import JobCard
from app.models.product import Product, ProductCategory
from app.services import proof_service
from app.services import workflow_service as wf
from app.services.pricing_service import COPY_NAMES, COPIES_ATTRIBUTE, GSM_ATTRIBUTE

STATUS_LABEL = {
    "pending": "Not started",
    "design": "In design",
    "approval": "Proof approval",
    "printing": "Printing",
    "binding": "Binding / finishing",
    "packing": "Packing & handover",
    "delivered": "Delivered",
}
STATUS_ORDER = ["pending", "design", "approval", "printing", "binding", "packing", "delivered"]
PAPER_NAME_ATTRIBUTE = "Paper Name"
PAPER_COLOUR_ATTRIBUTE = "Paper Colour"


def _value(option: Optional[AttributeOption]) -> str:
    return option.value if option is not None else ""


def _size_name(product: Optional[Product]) -> str:
    if product is None:
        return ""
    return product.name.replace("Sheet Printing - ", "")


def _copy_rows(db: Session, item, product: Product, chosen: Dict[str, str], layers: int) -> List[Dict[str, str]]:
    """One row per copy of the set: paper name, GSM, size and colour of EACH copy."""
    specs: List[dict] = [s for s in (item.layer_specs or []) if isinstance(s, dict)]
    legacy_gsm = list(item.layer_gsm_option_ids or [])
    options = {o.id: o for o in db.query(AttributeOption).filter(AttributeOption.id.in_(
        [v for s in specs for v in (s.get("paper_option_id"), s.get("gsm_option_id")) if v] + [g for g in legacy_gsm if g]
    )).all()} if (specs or legacy_gsm) else {}
    sizes = {p.id: p for p in db.query(Product).filter(Product.id.in_([s.get("size_product_id") for s in specs if s.get("size_product_id")])).all()} if specs else {}

    rows = []
    for i in range(layers):
        spec = specs[i] if i < len(specs) else {}
        paper = _value(options.get(spec.get("paper_option_id"))) or chosen.get(PAPER_NAME_ATTRIBUTE, "")
        if paper == "Custom" and spec.get("paper_custom"):
            paper = str(spec["paper_custom"])
        gsm = _value(options.get(spec.get("gsm_option_id")))
        if not gsm and i > 0 and i - 1 < len(legacy_gsm) and legacy_gsm[i - 1]:
            gsm = _value(options.get(legacy_gsm[i - 1]))
        gsm = gsm or chosen.get(GSM_ATTRIBUTE, "")
        size = _size_name(sizes.get(spec.get("size_product_id"))) or _size_name(product)
        rows.append({
            "copy": i + 1,
            "name": COPY_NAMES[i] if i < len(COPY_NAMES) else f"Copy {i + 1}",
            "paper": paper,
            "gsm": gsm,
            "size": size,
            "colour": spec.get("colour") or "",
        })
    return rows


def job_card_detail(db: Session, job: JobCard, with_price: bool = True) -> Dict[str, Any]:
    item = job.quotation_item
    quotation = item.quotation if item is not None else None
    product = job.product
    category = db.query(ProductCategory).filter(ProductCategory.id == product.category_id).first() if product is not None and product.category_id else None
    invoice = db.query(Invoice).filter(Invoice.quotation_id == quotation.id).first() if quotation is not None else None
    challan = db.query(DeliveryChallan).filter(DeliveryChallan.job_card_id == job.id).first()
    summary = wf.job_summary(job)
    priority = job.priority.value if hasattr(job.priority, "value") else str(job.priority)
    status_value = job.status.value if hasattr(job.status, "value") else str(job.status)

    # ---- everything chosen for the job, by attribute name -------------------
    specs: List[Dict[str, str]] = []
    chosen: Dict[str, str] = {}
    layers = 1
    if item is not None:
        for selected in sorted(item.selected_options, key=lambda s: (s.attribute.display_order if s.attribute else 0, s.id)):
            if selected.attribute is None or selected.attribute_option is None:
                continue
            chosen[selected.attribute.name] = selected.attribute_option.value
        copies_text = chosen.get(COPIES_ATTRIBUTE)
        if copies_text:
            try:
                layers = 1 + sum(int(p) for p in str(copies_text).split("+")[1:] if p.strip())
            except ValueError:
                layers = 1
        for name, value in chosen.items():
            # per-copy paper details are shown in the copies table instead
            if layers > 1 and name in (PAPER_NAME_ATTRIBUTE, GSM_ATTRIBUTE, PAPER_COLOUR_ATTRIBUTE):
                continue
            specs.append({"label": name, "value": value})
    copies = _copy_rows(db, item, product, chosen, layers) if (item is not None and layers > 1) else []
    if item is not None and layers > 1 and PAPER_COLOUR_ATTRIBUTE in chosen and not any(c["colour"] for c in copies):
        specs.append({"label": PAPER_COLOUR_ATTRIBUTE, "value": chosen[PAPER_COLOUR_ATTRIBUTE]})

    extras = []
    if item is not None:
        for line in item.charge_lines:
            extras.append({
                "group": line["group_name"] or "Extra",
                "name": (line["name"].split(" - ", 1)[1] if line["group_name"] and " - " in line["name"] else line["name"]),
                "full_name": line["name"],
                "amount": round(line["amount"], 2),
            })
        for custom in item.custom_charges or []:
            extras.append({"group": custom.get("group") or "Custom", "name": custom.get("label") or "Custom charge",
                           "full_name": custom.get("label") or "Custom charge", "amount": round(float(custom.get("amount") or 0), 2), "custom": True})

    notes = [n.strip() for n in (item.spec_notes if item is not None and item.spec_notes else job.notes or "").split("|") if n.strip()]

    steps = [wf.step_view(db, s) for s in sorted(job.steps, key=lambda s: s.position)]
    detail: Dict[str, Any] = {
        "job_card_id": job.id,
        "job_number": job.job_number,
        "status": status_value,
        "status_label": STATUS_LABEL.get(status_value, status_value),
        "stages": [{"key": k, "label": STATUS_LABEL[k]} for k in STATUS_ORDER],
        "priority": priority,
        "urgent": priority == "urgent",
        "created_at": job.created_at,
        "delivered_at": job.delivered_at,
        "delivery_date": job.delivery_date,
        "delivery_time": quotation.delivery_time if quotation is not None else None,
        "overdue": summary["overdue"],
        "invoice_number": invoice.invoice_number if invoice is not None else None,
        "bill_no": invoice.bill_no if invoice is not None else None,
        "invoice_date": invoice.invoice_date if invoice is not None else None,
        "order_number": quotation.quotation_number if quotation is not None else None,
        "dc_number": challan.dc_number if challan is not None else None,
        "customer": {
            "name": job.customer.name if job.customer is not None else "",
            "billing_person": getattr(job.customer, "billing_person_name", None) if job.customer is not None else None,
            "phone": job.customer.phone if job.customer is not None else None,
            "whatsapp": getattr(job.customer, "whatsapp_number", None) if job.customer is not None else None,
            "address": job.customer.address if job.customer is not None else None,
        },
        "job": {
            "service": category.name if category is not None else None,
            "item": product.name if product is not None else "",
            "quantity": item.quantity if item is not None else None,
            "sets": item.sets if item is not None else None,
            "area_sqft": item.area_sqft if item is not None else None,
        },
        "specs": specs,
        "copies": copies,
        "extras": [{k: v for k, v in e.items() if with_price or k != "amount"} for e in extras],
        "notes": notes,
        "proofs": proof_service.list_proofs(job),
        "steps": steps,
        "progress": {"done": summary["steps_done"], "total": summary["steps_total"]},
        "now_with": {
            "step": summary["current_step"],
            "work_center": summary["current_work_center"],
            "person": summary["current_assignee"],
            "status": summary["current_step_status"],
        },
        "with_price": with_price,
    }
    if with_price and item is not None:
        detail["price"] = {
            "rate": round(item.unit_price or 0, 2),
            "amount": round(item.total_price or 0, 2),
            "discount": round(item.discount_amount or 0, 2),
            "tax": round(item.tax_amount or 0, 2),
            "breakdown": item.price_breakdown or [],
            "with_gst": bool(quotation.with_gst) if quotation is not None else False,
        }
    return detail
