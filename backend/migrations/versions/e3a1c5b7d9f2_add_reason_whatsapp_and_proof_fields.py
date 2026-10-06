"""Add reason/whatsapp to customers, proof1/proof2 date+time to quotations

Revision ID: e3a1c5b7d9f2
Revises: c7d8e2f4a1b6
Create Date: 2026-10-06 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e3a1c5b7d9f2'
down_revision: Union[str, Sequence[str], None] = 'c7d8e2f4a1b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('customers', sa.Column('whatsapp_number', sa.String(), nullable=True))
    op.add_column('customers', sa.Column('reason', sa.String(), nullable=True))
    op.add_column('quotations', sa.Column('proof1_date', sa.Date(), nullable=True))
    op.add_column('quotations', sa.Column('proof1_time', sa.String(), nullable=True))
    op.add_column('quotations', sa.Column('proof2_date', sa.Date(), nullable=True))
    op.add_column('quotations', sa.Column('proof2_time', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('quotations', 'proof2_time')
    op.drop_column('quotations', 'proof2_date')
    op.drop_column('quotations', 'proof1_time')
    op.drop_column('quotations', 'proof1_date')
    op.drop_column('customers', 'reason')
    op.drop_column('customers', 'whatsapp_number')