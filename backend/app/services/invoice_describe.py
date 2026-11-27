"""The text of an invoice row as it should read everywhere (invoice list, invoice page, PDFs)."""
from typing import Optional

from app.models.invoice import InvoiceItem
from app.models.product import Product


def describe_item(item: InvoiceItem, product: Optional[Product]) -> str:
    """What was typed on the invoice, else the item name with every option chosen (Bill Book - 1/4 (80 GSM, 1+2 ...))."""
    from app.services.bill_pdf_service import _item_text
    if getattr(item, "particulars", None):
        return ", ".join(l.strip() for l in item.particulars.splitlines() if l.strip())
    description, _ = _item_text(product, item)
    return description
