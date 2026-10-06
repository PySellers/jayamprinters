"""Add billing_person_name to customers

Revision ID: f4b2d6c8a0e3
Revises: e3a1c5b7d9f2
Create Date: 2026-10-06 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f4b2d6c8a0e3'
down_revision: Union[str, Sequence[str], None] = 'e3a1c5b7d9f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('customers', sa.Column('billing_person_name', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('customers', 'billing_person_name')