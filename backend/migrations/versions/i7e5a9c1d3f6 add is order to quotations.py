"""Mark quotations that come from Start New Order (is_order)

Revision ID: i7e5a9c1d3f6
Revises: h6d4f8b0c2e5
Create Date: 2026-10-09 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'i7e5a9c1d3f6'
down_revision: Union[str, Sequence[str], None] = 'h6d4f8b0c2e5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('quotations', sa.Column('is_order', sa.Boolean(), nullable=False, server_default=sa.text('false')))

    # Existing quotations that were already converted to job cards or invoiced were
    # created by the old Start New Order flow. Mark them as orders and give them the
    # OD- number series, so the Quotations page and QT- numbering start clean.
    op.execute("""
        UPDATE quotations SET is_order = true
        WHERE status = 'converted'
           OR EXISTS (SELECT 1 FROM invoices i WHERE i.quotation_id = quotations.id)
    """)
    op.execute("""
        UPDATE quotations SET quotation_number = 'OD-' || substr(quotation_number, 4)
        WHERE is_order = true AND quotation_number LIKE 'QT-%'
    """)


def downgrade() -> None:
    op.execute("""
        UPDATE quotations SET quotation_number = 'QT-' || substr(quotation_number, 4)
        WHERE is_order = true AND quotation_number LIKE 'OD-%'
    """)
    op.drop_column('quotations', 'is_order')