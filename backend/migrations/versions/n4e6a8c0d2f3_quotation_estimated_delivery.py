"""Quotations: free-text estimated delivery

Revision ID: n4e6a8c0d2f3
Revises: m3d5f7a9c1e2
Create Date: 2026-10-26

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'n4e6a8c0d2f3'
down_revision: Union[str, Sequence[str], None] = 'm3d5f7a9c1e2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('quotations', sa.Column('estimated_delivery', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('quotations', 'estimated_delivery')
