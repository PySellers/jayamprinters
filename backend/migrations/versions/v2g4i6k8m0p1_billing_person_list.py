"""Billing Person Name list: a name can be removed from the drop-down (customers keep their orders)

Revision ID: v2g4i6k8m0p1
Revises: u1f3h5j7l9n0
Create Date: 2026-11-19

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'v2g4i6k8m0p1'
down_revision: Union[str, Sequence[str], None] = 'u1f3h5j7l9n0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('customers', sa.Column('hidden_in_billing', sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    op.drop_column('customers', 'hidden_in_billing')
