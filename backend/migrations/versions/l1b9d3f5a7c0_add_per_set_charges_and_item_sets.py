"""Add per_set charge type and quotation_items.sets

Revision ID: l1b9d3f5a7c0
Revises: k9a7c1e3b5d8
Create Date: 2026-10-23

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'l1b9d3f5a7c0'
down_revision: Union[str, Sequence[str], None] = 'k9a7c1e3b5d8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # A new enum value cannot be used in the transaction that adds it, so commit it on its own.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE chargetype ADD VALUE IF NOT EXISTS 'per_set'")
    op.add_column('quotation_items', sa.Column('sets', sa.Integer(), nullable=False, server_default='1'))


def downgrade() -> None:
    # PostgreSQL cannot drop a single enum value; per_set simply stays defined (unused).
    op.drop_column('quotation_items', 'sets')
