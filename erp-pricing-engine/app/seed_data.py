"""
Full catalog seed covering every product family in the rate-card PDF (all 24
pages), not just a worked example. Every category, attribute and option below
is transcribed from the PDF's tables.

IMPORTANT — read before treating any of this as real pricing:
Only the RUBBER_STAMP_POLYMER SKU prices (page 20) were printed as real numbers
in the source PDF. Every other category's rate cells were BLANK templates (the
shop had drawn the grid but not filled in the rupee values). So every other
category here is seeded with:
  - the REAL attributes/options/sizes/papers/GSM tiers/quantity bands (these
    are transcribed exactly, so every choice a customer or counter staff can
    make is genuinely captured), and
  - a PLACEHOLDER flat rate per quantity slab (same rate regardless of which
    attribute options are picked), clearly marked, standing in until the shop
    keys in its real rate card.

Replacing the placeholders is a data-entry task (one PriceMatrixCell per real
size/paper/GSM combination and slab), not a code change — that's the point of
the metadata-driven design in Section 6 of the blueprint doc.
"""
from sqlalchemy.orm import Session

from app.models import (
    ProductCategory, PricingMode, Attribute, AttributeOption,
    QuantitySlab, PriceMatrixCell, ExtraCharge, ChargeType, SKUProduct,
    User, UserRole,
)
from app.security import hash_password


# ---------------------------------------------------------------------------
# Small helpers so 16 categories don't turn into 1600 lines of repetition.
# ---------------------------------------------------------------------------

def _category(db, code, name, mode=PricingMode.MATRIX):
    c = ProductCategory(code=code, name=name, pricing_mode=mode)
    db.add(c)
    db.flush()
    return c


def _attr(db, category, code, name, values):
    a = Attribute(category_id=category.id, code=code, name=name)
    db.add(a)
    db.flush()
    db.add_all(AttributeOption(attribute_id=a.id, value=v) for v in values)
    return a


def _flat_slabs(db, category, slab_defs, placeholder_rate):
    """slab_defs: list of (label, min_qty, max_qty_or_None, is_additional_block).
    Seeds one QuantitySlab + one attribute-agnostic PriceMatrixCell per slab, all
    at the same placeholder rate. See module docstring for why."""
    slabs = [
        QuantitySlab(category_id=category.id, label=label, min_qty=mn, max_qty=mx, is_additional_block=add)
        for label, mn, mx, add in slab_defs
    ]
    db.add_all(slabs)
    db.flush()
    db.add_all(
        PriceMatrixCell(category_id=category.id, slab_id=s.id, attribute_selector={}, base_rate=str(placeholder_rate))
        for s in slabs
    )
    return slabs


def _extra(db, category, code, name, ctype, amount, minimum=None):
    db.add(ExtraCharge(
        category_id=category.id, code=code, name=name, charge_type=ctype,
        amount=str(amount), minimum_amount=str(minimum) if minimum is not None else None,
    ))


def _bands_to_slabs(bands):
    """Turns a list of exact quantity break-points (as printed in the PDF,
    e.g. visiting-card bands 50,100,150...40000) into contiguous (label,min,max,False)
    slab tuples, plus a trailing open-ended 'Additional per 1000' block."""
    slabs = []
    prev = 1
    for b in bands:
        slabs.append((f"Up to {b}", prev, b, False))
        prev = b + 1
    slabs.append((f"Additional per 1000 above {bands[-1]}", prev, None, True))
    return slabs


GSM_TIERS_STD = ["90", "100", "130", "170", "250", "300", "350", "400", "500", "600"]
GSM_TIERS_STATIONERY = ["54", "60", "70", "80", "85", "90", "100", "120"]
LAMINATION_STD = ["None", "Glass", "Matt", "3D", "Thermal Glass", "Thermal Matt"]
SPECIAL_WORK_STD = ["None", "UV", "Nurling", "UV with Nurling", "Gold Foiling", "Silver Foiling", "Embossing"]
BINDING_GENERIC = [
    "Soft Binding", "Hard Binding", "Calico Binding", "Paper Rexon",
    "Rexon Binding", "Rexon Corner", "Full Rexon", "Leather", "Leather Corner",
]


def seed(db: Session) -> None:
    if db.query(ProductCategory).count() > 0:
        return  # already seeded

    # ==================================================================
    # 1) WEDDING INVITATION — OFFSET (Card & Cover, pages 4-9)
    # ==================================================================
    inv_offset = _category(db, "WEDDING_INVITATION_OFFSET", "Wedding Invitation (Offset)")
    # Per the PDF's own header on this product family ("Inviatation, Wedding
    # Invitation / Progress Report / Rank Card / Mark Sheet / Inviation / Multi
    # Color Tag / Fund Card / Card / Bitt Notice / Card / greetings Card /
    # Office Card") — these are all just different USES of the exact same
    # card-printing form (same size/paper/GSM/colour/lamination fields decide
    # the price). Modelled as one selectable attribute rather than 11 separate
    # categories, so the price logic isn't duplicated 11 times.
    _attr(db, inv_offset, "CARD_TYPE", "What is this for?", [
        "Wedding Invitation", "Progress Report", "Rank Card", "Mark Sheet",
        "Multi Color Tag", "Fund Card", "Card", "Bit Notice", "Greetings Card", "Office Card",
    ])
    _attr(db, inv_offset, "SIZE", "Size",
          ["6x4 Single & Fold", "13x19", "17x24", "18x23", "22x28", "Custom Size"])
    _attr(db, inv_offset, "PAPER", "Paper / Board",
          ["Art Paper", "Art Board", "Duplex Paper", "Duplex Board", "Maplitho Paper",
           "Metallic Board", "Laminated Board", "Brown Paper"])
    _attr(db, inv_offset, "GSM", "GSM", GSM_TIERS_STD)
    _attr(db, inv_offset, "COLOR", "Colour", ["Single Color", "Two Color", "Multicolor"])
    _attr(db, inv_offset, "SIDE", "Side", ["Single Side", "Both Side / Front & Back"])
    _attr(db, inv_offset, "LAMINATION", "Lamination", LAMINATION_STD)
    _attr(db, inv_offset, "SPECIAL_WORK", "Special Work", SPECIAL_WORK_STD)
    _flat_slabs(db, inv_offset, [
        ("1-500", 1, 500, False), ("501-1000", 501, 1000, False),
        ("Additional each 1", 1001, None, True),
    ], placeholder_rate="8.00")  # PLACEHOLDER
    _extra(db, inv_offset, "THREAD_STITCH", "Thread Stitching", ChargeType.PER_UNIT, "0.50")
    _extra(db, inv_offset, "PASTING", "Invitation Pasting", ChargeType.PER_UNIT, "0.50")
    _extra(db, inv_offset, "BOTTOM_FOLD", "Bottom Folding", ChargeType.PER_UNIT, "0.30")
    _extra(db, inv_offset, "STICKER_PASTE", "Image/Sticker Pasting", ChargeType.PER_UNIT, "0.50")
    _extra(db, inv_offset, "BOX_PASTE", "Invitation/Cover Box Type Pasting", ChargeType.PER_UNIT, "1.00")
    _extra(db, inv_offset, "GOLD_FOIL", "Gold Foiling", ChargeType.PER_UNIT, "1.00", minimum=100)
    _extra(db, inv_offset, "SILVER_FOIL", "Silver Foiling", ChargeType.PER_UNIT, "0.80", minimum=100)

    # ==================================================================
    # 2) WEDDING INVITATION — SCREEN WORK (page 4, smaller qty bands)
    # ==================================================================
    inv_screen = _category(db, "WEDDING_INVITATION_SCREEN", "Wedding Invitation (Screen Work)")
    _attr(db, inv_screen, "CARD_TYPE", "What is this for?", [
        "Wedding Invitation", "Progress Report", "Rank Card", "Mark Sheet",
        "Multi Color Tag", "Fund Card", "Card", "Bit Notice", "Greetings Card", "Office Card",
    ])
    _attr(db, inv_screen, "SIZE", "Size", ["6x4 Single & Fold", "Custom Size"])
    _attr(db, inv_screen, "PAPER", "Paper / Board",
          ["Art Paper", "Art Board", "Duplex Paper", "Duplex Board", "Maplitho Paper"])
    _attr(db, inv_screen, "COLOR", "Colour", ["Single Color", "Two Color", "Multicolor"])
    _attr(db, inv_screen, "SIDE", "Side", ["Single Side", "Both Side / Front & Back"])
    _flat_slabs(db, inv_screen, [
        ("1-100", 1, 100, False), ("Additional each 1", 101, None, True),
    ], placeholder_rate="6.00")  # PLACEHOLDER

    # ==================================================================
    # 3) READYMADE INVITATION / FRIENDS CARD (page 4-5)
    # ==================================================================
    inv_ready = _category(db, "READYMADE_INVITATION", "Readymade Invitation (Friends Card)")
    _attr(db, inv_ready, "SOURCE", "Card Source", ["Customer Supplied (printing only)", "Press Readymade"])
    _attr(db, inv_ready, "SIDE", "Side", ["Single Side", "Both Side / Front & Back"])
    _flat_slabs(db, inv_ready, [("Per Piece", 1, None, False)], placeholder_rate="5.00")  # PLACEHOLDER
    _extra(db, inv_ready, "THREAD_STITCH", "Thread Stitching", ChargeType.PER_UNIT, "0.50")
    _extra(db, inv_ready, "BOX_PASTE", "Box Type Pasting", ChargeType.PER_UNIT, "1.00")
    _extra(db, inv_ready, "GOLD_FOIL", "Gold Foiling", ChargeType.PER_UNIT, "1.00")
    _extra(db, inv_ready, "SILVER_FOIL", "Silver Foiling", ChargeType.PER_UNIT, "0.80")
    _extra(db, inv_ready, "CUSTOM_WORK", "Custom Work", ChargeType.FLAT, "50")

    # ==================================================================
    # 4) COVER — CUSTOMISE OFFSET (page 9)
    # ==================================================================
    cover_custom = _category(db, "COVER_CUSTOMISE_OFFSET", "Cover - Customised Offset")
    _attr(db, cover_custom, "SIZE", "Size", ["18x23 (28pc)", "1.5x2 Card", "1.75x2.25"])
    _attr(db, cover_custom, "PAPER", "Paper / Board",
          ["Art Paper", "Maplitho Paper", "Art Board", "Duplex Paper", "Duplex Board", "Metallic Board", "Brown Paper"])
    _attr(db, cover_custom, "GSM", "GSM", ["90", "100", "130", "170", "250", "300", "350"])
    _attr(db, cover_custom, "COLOR", "Colour", ["Single Color", "Two Color", "Multicolor"])
    _attr(db, cover_custom, "LAMINATION", "Lamination", LAMINATION_STD)
    _attr(db, cover_custom, "SPECIAL_WORK", "Special Work", SPECIAL_WORK_STD)
    _flat_slabs(db, cover_custom, [
        ("1-500", 1, 500, False), ("501-1000", 501, 1000, False),
        ("Additional each 1", 1001, None, True),
    ], placeholder_rate="7.00")  # PLACEHOLDER

    # ==================================================================
    # 5) READYMADE COVER (page 10)
    # ==================================================================
    cover_ready = _category(db, "READYMADE_COVER", "Readymade Cover")
    _attr(db, cover_ready, "SOURCE", "Source",
          ["Customer & Press (printing only)", "Press Readymade (cover + printing)"])
    _attr(db, cover_ready, "SIZE", "Size", [
        "6x4", "6.5x4.5", "7x5", "7.5x5.5", "8x6", "7x4", "8x5", "8.5x5.5", "9x6",
        "9.5x6.5", "9x4", "10.5x4.5", "12x8", "12x9", "12x10", "9x14 (Legal)",
        "12x17 (A3)", "15x20", "Viboothi Cover",
    ])
    _attr(db, cover_ready, "PRINT_METHOD", "Print Method", ["Offset", "Screen", "Digital"])
    _attr(db, cover_ready, "SIDE", "Side", ["Single Side", "Both Side / Front & Back"])
    _flat_slabs(db, cover_ready, [
        ("1-100", 1, 100, False), ("101-500", 101, 500, False), ("501-1000", 501, 1000, False),
        ("Additional each 1", 1001, None, True),
    ], placeholder_rate="4.00")  # PLACEHOLDER

    # ==================================================================
    # 6) VISITING CARD (page 18) — full real quantity bands from the PDF
    # ==================================================================
    vcard = _category(db, "VISITING_CARD", "Visiting Card")
    _attr(db, vcard, "DESIGNING", "Designing", ["With Designing", "Without Designing", "Logo Designing"])
    _attr(db, vcard, "SIDE", "Side", ["Single Side", "Front & Back"])
    _attr(db, vcard, "LAMINATION", "Lamination",
          ["Without Lamination", "Gloss Lamination", "Matt Lamination", "3D Lamination",
           "Ivory / Criss Cross / Gold Metallic / White Nurling / Puff Nurling / Silver Metallic / Special Board"])
    real_bands = [50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 1000, 1500,
                  2000, 2500, 3000, 3500, 4000, 4500, 5000, 10000, 20000, 30000, 40000]
    _flat_slabs(db, vcard, _bands_to_slabs(real_bands), placeholder_rate="2.50")  # PLACEHOLDER
    _extra(db, vcard, "FOILING", "Gold/Silver Foiling (or named colour)", ChargeType.PER_UNIT, "0.50", minimum=50)
    _extra(db, vcard, "CORNER_CUT_SMALL", "Corner Cutting - Small (2 or 4 corner)", ChargeType.FLAT, "30")
    _extra(db, vcard, "CORNER_CUT_MEDIUM", "Corner Cutting - Medium", ChargeType.FLAT, "40")
    _extra(db, vcard, "CORNER_CUT_BIG", "Corner Cutting - Big", ChargeType.FLAT, "50")

    # ==================================================================
    # 7) ID CARD (page 19)
    # ==================================================================
    idcard = _category(db, "ID_CARD", "ID Card")
    _attr(db, idcard, "TYPE", "Card Type",
          ["Synthetic ID Card", "PVC ID Card", "Chip Card", "ID Sticker Only", "Temporary ID Card (PVC Pouch)"])
    _attr(db, idcard, "ORIENTATION", "Orientation", ["Portrait", "Landscape"])
    _attr(db, idcard, "SIDE", "Side", ["Single Side", "Front & Back"])
    _attr(db, idcard, "HOLDER_QUALITY", "Holder Quality", ["First Quality", "2nd Quality"])
    _attr(db, idcard, "ROPE_TYPE", "Rope / Attachment", ["Single Colour Rope", "Multi Colour Rope", "Hook Model"])
    _flat_slabs(db, idcard, [
        ("1-100", 1, 100, False), ("101-500", 101, 500, False),
        ("Additional each 1", 501, None, True),
    ], placeholder_rate="15.00")  # PLACEHOLDER
    _extra(db, idcard, "HOLDER_COLOR", "Holder Colour Charge", ChargeType.PER_UNIT, "2.00")
    _extra(db, idcard, "ROPE_COLOR", "Rope Printing Colour Charge", ChargeType.PER_UNIT, "1.00")

    # ==================================================================
    # 8) STATIONERY / BILL BOOKS (page 11) — 12 document types share one
    #    pricing structure per the PDF
    # ==================================================================
    stationery = _category(db, "STATIONERY_BILL_BOOK", "Stationery / Bill Book")
    _attr(db, stationery, "DOCUMENT_TYPE", "Document Type", [
        "Letter Pad", "Invoice", "Bill Book", "Cash Memo", "Trip Sheet", "Estimate",
        "Exam Sheet", "Delivery Challan", "Visitor Pass", "Prescription Memo",
        "Gate Pass", "Cash Voucher",
    ])
    _attr(db, stationery, "PAPER_NAME", "Paper Name", [
        "Royal Ex.Bond", "Excel Bond", "Palarpur", "Westcost", "Sheshai", "Sirpur",
        "Seshai Ledger", "Sirpur Ledger", "Westcost Ledger", "Foreign Paper", "Custom",
    ])
    _attr(db, stationery, "PAPER_COLOR", "Paper Colour", ["White", "Pink", "Yellow", "Green", "Blue", "Rough", "Custom"])
    _attr(db, stationery, "GSM", "GSM", GSM_TIERS_STATIONERY)
    _attr(db, stationery, "PRINTING_SIDE", "Printing", ["Single Side", "Front & Back"])
    _attr(db, stationery, "BILL_COPIES", "Bill Type", ["Single Bill", "Two Bill", "Three Bill", "Four Bill", "Six Bill", "Eight Bill"])
    _attr(db, stationery, "BINDING_TYPE", "Binding Type", ["Loose Sheet", "Pad", "Soft Binding", "Hard Binding", "Custom"])
    _attr(db, stationery, "BINDING_MODEL", "Binding Model", ["Top Binding", "Side Binding", "Bottom Binding", "Center Stitching"])
    _attr(db, stationery, "SET_SIZE", "Binding Set", ["25 Set", "50 Set", "100 Set", "200 Set", "Custom"])
    _attr(db, stationery, "FRACTION_SIZE", "Sheet Size (Fraction)", [
        "1/4", "1/5", "1/6", "1/6 Length", "1/8", "1/8 Length", "1/10", "1/12", "1/16", "1/24", "A3",
    ])
    _flat_slabs(db, stationery, [
        ("1st 1000 nos", 1, 1000, False), ("Additional 1000 nos", 1001, None, True),
    ], placeholder_rate="1.20")  # PLACEHOLDER

    # ==================================================================
    # 9) REGISTER (page 15)
    # ==================================================================
    register = _category(db, "REGISTER", "Register")
    _attr(db, register, "SIZE", "Size",
          ["15x20", "20x30", "18x23", "11.5x18 (A3)", "12.5x18 (A3)", "A4 (210x297mm)", "A4", "A5"])
    _attr(db, register, "PAPER_TYPE", "Paper Type", ["White Paper", "Ledger Paper"])
    _attr(db, register, "GSM", "GSM", GSM_TIERS_STATIONERY)
    _attr(db, register, "PRINTING_COLOR", "Printing Colour", ["1 Color", "2 Color", "3 Color", "Multi Color"])
    _attr(db, register, "BINDING_TYPE", "Binding Type", ["Side Binding", "Center Binding", "Section Binding"])
    _attr(db, register, "BINDING", "Binding", BINDING_GENERIC)
    _attr(db, register, "PAGE_COUNT", "No. of Pages", ["32", "64", "100", "200", "300", "400", "500"])
    _attr(db, register, "SET_SIZE", "Binding Set", ["25 Set", "50 Set", "100 Set", "200 Set", "Custom"])
    _flat_slabs(db, register, [("Per Book", 1, None, False)], placeholder_rate="45.00")  # PLACEHOLDER

    # ==================================================================
    # 10) APPLICATION FORM (page 17)
    # ==================================================================
    app_form = _category(db, "APPLICATION_FORM", "Application Form")
    _attr(db, app_form, "SIZE", "Size", [
        "15x20", "20x30", "12x18", "13x19", "18x23", "11.5x18 (A3)", "12.5x18 (A3)",
        "A4 (210x297mm)", "A4", "A5",
    ])
    _attr(db, app_form, "PAPER_NAME", "Paper Name", [
        "White Paper", "Matt Art Paper", "Royal Ex.Bond", "Excel Bond", "Palarpur Ledger",
        "Seshai Ledger", "Sirpur Ledger", "Westcos Ledger", "Foreign Paper",
        "Nurling Paper", "Texture Paper", "Custom",
    ])
    _attr(db, app_form, "SIDE", "Side", ["Single Side", "Both Side / Front & Back"])
    _attr(db, app_form, "FOLDING", "Folding", ["None", "Two Folding", "Three Folding", "4 Folding", "Booklet"])
    _flat_slabs(db, app_form, [
        ("1-50", 1, 50, False), ("51-100", 51, 100, False), ("Additional each 1", 101, None, True),
    ], placeholder_rate="1.50")  # PLACEHOLDER

    # ==================================================================
    # 11) T.C. / TRANSFER CERTIFICATE (page 16)
    # ==================================================================
    tc = _category(db, "TC_TRANSFER_CERTIFICATE", "T.C. / Transfer Certificate")
    _attr(db, tc, "SIZE", "Size",
          ["15x20", "12x18", "11.5x18 (A3)", "12.5x18 (A3)", "A4 (210x297mm)", "A4", "A5"])
    _attr(db, tc, "PAPER_NAME", "Paper Name", ["White Paper", "Special Paper", "Royal Ex.Bond", "Excel Bond",
                                                "Sirpur Ledger", "Palarpur Ledger", "Westcos Ledger"])
    _attr(db, tc, "GSM", "GSM", GSM_TIERS_STATIONERY)
    _attr(db, tc, "SIDE", "Side", ["Single Side", "Both Side / Front & Back"])
    _attr(db, tc, "BINDING", "Binding", BINDING_GENERIC)
    _attr(db, tc, "PAGE_COUNT", "No. of Pages", ["50", "100", "200", "300", "400", "500"])
    _attr(db, tc, "SET_SIZE", "Binding Set", ["25 Set", "50 Set", "100 Set", "200 Set", "Custom"])
    _flat_slabs(db, tc, [("Minimum 1 Book", 1, None, False)], placeholder_rate="60.00")  # PLACEHOLDER

    # ==================================================================
    # 12) MENU CARD (page 22)
    # ==================================================================
    menu = _category(db, "MENU_CARD", "Menu Card")
    _attr(db, menu, "SIZE", "Size", [
        "15x20", "20x30", "12x18", "13x19", "18x23", "11.5x18 (A3)", "12.5x18 (A3)",
        "A4 (210x297mm)", "A4", "A5",
    ])
    _attr(db, menu, "PAPER", "Paper", ["Art Paper", "Maplitho Paper"])
    _attr(db, menu, "GSM", "GSM", ["80", "90", "100", "130", "170", "250", "300"])
    _attr(db, menu, "BOARD", "Board", [
        "Art Board", "Matt Art", "Criss Cross Board", "Needlepoint Board",
        "Gold Metallic", "Silver Metallic", "Nurling Board", "Special Board",
    ])
    _attr(db, menu, "LAMINATION", "Lamination", LAMINATION_STD)
    _attr(db, menu, "SPECIAL_WORK", "Special Work", ["None", "Nurling", "Gold Foiling", "Silver Foiling", "Embossing"])
    _attr(db, menu, "BINDING", "Binding", [
        "Pouch Lamination", "Soft Binding", "Hard Binding", "Karishma Binding",
        "Wiro Binding", "Spiral Binding", "Case Binding",
    ])
    _attr(db, menu, "DESIGNING", "Designing", ["With Designing", "Without Designing"])
    _attr(db, menu, "SIDE", "Side", ["Single Side", "Both Side / Front & Back"])
    _flat_slabs(db, menu, [
        ("1-5", 1, 5, False), ("Additional each 1", 6, None, True),
    ], placeholder_rate="25.00")  # PLACEHOLDER

    # ==================================================================
    # 13) RUBBER STAMP — POLYMER (page 20) — REAL prices from the PDF
    # ==================================================================
    stamp = _category(db, "RUBBER_STAMP_POLYMER", "Rubber Stamp - Polymer", mode=PricingMode.SKU)
    # Every SKU below is transcribed exactly from page 20 (series A/B/C/D/X).
    real_skus = [
        ("A1_25X8", "30"), ("A2_35X8", "30"), ("A3_50X8", "35"), ("A4_60X8", "40"),
        ("A5_25X12", "40"), ("A6_35X12", "40"), ("A7_50X12", "60"), ("A8_60X12", "70"),
        ("A9_70X12", "80"), ("A10_16X16", "30"), ("A11_35X16", "50"), ("A12_50X16", "60"),
        ("A13_60X16", "60"), ("A14_35X20", "70"), ("A15_50X20", "70"), ("A16_24X24", "40"),
        ("A17_40X24", "60"), ("A18_14X14", "60"), ("A19_22X22", "80"), ("A20_30X30", "120"),
        ("A21_34X34", "140"),
        ("B1_80X12", "60"), ("B2_70X16", "60"), ("B3_80X16", "80"), ("B4_60X20", "80"),
        ("B5_70X20", "90"), ("B6_80X20", "100"), ("B7_50X24", "80"), ("B8_60X24", "80"),
        ("B9_70X24", "100"), ("B10_80X24", "120"), ("B11_50X28", "120"), ("B12_60X28", "120"),
        ("B13_32X32", "90"), ("B14_55X32", "120"), ("B15_38X38", "130"), ("B16_46X46", "140"),
        ("B17_40X30", "100"), ("B18_55X33", "120"),
        ("C1_100X12", "100"), ("C2_100X16", "100"), ("C3_100X20", "120"), ("C4_70X28", "120"),
        ("C5_80X28", "140"), ("C6_65X32", "140"), ("C7_80X32", "150"), ("C8_60X36", "150"),
        ("C9_75X36", "140"), ("C10_40X40", "120"), ("C11_55X40", "140"), ("C12_70X40", "180"),
        ("C13_54X54", "180"), ("C14_60X40", "180"), ("C15_70X50", "200"),
        ("D1_70X50", "150"),
        ("X1_123X15", "150"), ("X2_123X25", "160"), ("X3_123X35", "200"), ("X4_123X48", "250"),
        ("X5_123X62", "300"), ("X6_123X76", "400"), ("X7_123X96", "500"), ("X8_86X48", "150"),
        ("X9_86X58", "160"), ("X10_76X76", "250"), ("X11_96X76", "300"), ("X12_86X66", "250"),
        ("X13_94X44", "200"), ("X14_96X96", "400"), ("X15_76X52", "200"), ("X16_96X66", "300"),
    ]
    db.add_all(
        SKUProduct(category_id=stamp.id, sku_code=code, name=f"Polymer Stamp {code.split('_')[1]}mm", price=price)
        for code, price in real_skus
    )

    # ==================================================================
    # 14) SELF-INK STAMP (page 21) — model names real, prices blank in PDF
    # ==================================================================
    self_ink = _category(db, "SELF_INK_STAMP", "Self-Ink Stamp (Colob / Pre-Ink / Sun)", mode=PricingMode.SKU)
    self_ink_models = [
        "Printer C10 (10x27mm)", "Printer C20 (14x38mm)", "Printer C30 (18x47mm)",
        "Printer C40 (23x59mm)", "Printer C50 (30x69mm)", "Printer C60 (37x76mm)",
        "Printer S200 (24x45mm)", "Printer 53 (30x45mm)", "Printer 35 (30x50mm)",
        "Printer 38 (33x56mm)", "Printer 54 (40x50mm)", "Printer 55 (40x60mm)",
        "Printer 05 (6x15mm)", "Printer 15 (10x69mm)", "Printer 25 (15x75mm)",
        "Printer-Dater", "Printer Q-Dater", "Pocket Stamp Plus", "Printer Mini Line",
    ]
    db.add_all(
        SKUProduct(category_id=self_ink.id, sku_code=f"SELFINK_{i+1}", name=m, price="0")  # PLACEHOLDER - blank in PDF
        for i, m in enumerate(self_ink_models)
    )

    # ==================================================================
    # 15) DIGITAL BANNER / FLEX / STICKER (page 24)
    # ==================================================================
    banner = _category(db, "DIGITAL_BANNER", "Digital Banner / Flex / Sticker")
    _attr(db, banner, "MEDIA", "Media", [
        "Flex", "Star Flex", "One-way Sticker", "Clear Sticker", "Eco Solvent Sticker",
        "Sunpack Sheet", "Foam Sheet", "Acrylic Sheet",
    ])
    _attr(db, banner, "LIGHT_TYPE", "Sunpack Light Type", ["Front Light", "Back Light", "N/A"])
    _attr(db, banner, "MOUNTING", "Mounting", ["Flex Only", "With Frame", "With Fittings"])
    _attr(db, banner, "SIDE", "Side", ["Single Side", "Both Side / Front & Back"])
    _flat_slabs(db, banner, [("Per Sq.Ft", 1, None, False)], placeholder_rate="35.00")  # PLACEHOLDER
    _extra(db, banner, "TRANSPORT", "Transport Charge", ChargeType.FLAT, "150")

    # ==================================================================
    # 16) THAMBOOLA BAG (page 23)
    # ==================================================================
    thamboola = _category(db, "THAMBOOLA_BAG", "Thamboola Bag")
    _attr(db, thamboola, "SOURCE", "Source", [
        "Customer Supplied Cover (printing only)", "Press Readymade (cover + printing)",
    ])
    _attr(db, thamboola, "SIDE", "Side", ["Single Side", "Both Side / Front & Back"])
    _flat_slabs(db, thamboola, [("Per Piece", 1, None, False)], placeholder_rate="8.00")  # PLACEHOLDER

    db.commit()


def seed_users(db: Session) -> None:
    """
    Dev-only default logins so the role-gated admin.html screens are usable
    out of the box. CHANGE OR REMOVE THESE before this is exposed beyond your
    own machine -- these are intentionally simple, published passwords.
    """
    if db.query(User).count() > 0:
        return

    defaults = [
        ("admin", "admin123", UserRole.ADMIN, "Shop Owner / Admin"),
        ("counter", "counter123", UserRole.COUNTER, "Counter Staff"),
        ("production", "production123", UserRole.PRODUCTION, "Production Staff"),
        ("accounts", "accounts123", UserRole.ACCOUNTS, "Accounts Staff"),
    ]
    db.add_all(
        User(username=u, password_hash=hash_password(p), role=r, full_name=n)
        for u, p, r, n in defaults
    )
    db.commit()
