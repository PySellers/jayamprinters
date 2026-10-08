"""Store with_gst per order (quotation) and per invoice

Revision ID: g5c3e7a9b1d4
Revises: f4b2d6c8a0e3
Create Date: 2026-10-07 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'g5c3e7a9b1d4'
down_revision: Union[str, Sequence[str], None] = 'f4b2d6c8a0e3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('quotations', sa.Column('with_gst', sa.Boolean(), nullable=False, server_default=sa.text('true')))
    op.add_column('invoices', sa.Column('with_gst', sa.Boolean(), nullable=False, server_default=sa.text('false')))

    # Backfill invoices that already exist.
    #  - tax was charged            -> GST invoice
    #  - Rs. 0 invoice, customer has a GSTIN -> GST invoice
    #  - everything else (tax zeroed)        -> cash bill
    op.execute("""
        UPDATE invoices SET with_gst = (
            tax_amount > 0
            OR (grand_total = 0 AND EXISTS (
                SELECT 1 FROM customers c
                WHERE c.id = invoices.customer_id AND COALESCE(TRIM(c.gstin), '') <> ''
            ))
        )
    """)
    # Quotations follow their invoice; quotations not yet invoiced follow the customer's GSTIN.
    op.execute("""
        UPDATE quotations SET with_gst = EXISTS (
            SELECT 1 FROM customers c
            WHERE c.id = quotations.customer_id AND COALESCE(TRIM(c.gstin), '') <> ''
        )
    """)
    op.execute("""
        UPDATE quotations SET with_gst = i.with_gst
        FROM invoices i WHERE i.quotation_id = quotations.id
    """)


def downgrade() -> None:
    op.drop_column('invoices', 'with_gst')
    op.drop_column('quotations', 'with_gst')