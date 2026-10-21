"""Add quantity_slabs.is_incremental and product_categories.min_charge

Revision ID: k9a7c1e3b5d8
Revises: j8f6b0d2e4a7
Create Date: 2026-10-21

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'k9a7c1e3b5d8'
down_revision: Union[str, Sequence[str], None] = 'j8f6b0d2e4a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Existing bands keep their current behaviour (rate applies to the whole quantity).
    op.add_column('quantity_slabs', sa.Column('is_incremental', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('product_categories', sa.Column('min_charge', sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column('product_categories', 'min_charge')
    op.drop_column('quantity_slabs', 'is_incremental')
