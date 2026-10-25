"""Purchase bills: the supplier's original photo / PDF kept with a purchase

Revision ID: p6a8c0e2f4b5
Revises: o5f7b9d1e3a4
Create Date: 2026-10-26

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'p6a8c0e2f4b5'
down_revision: Union[str, Sequence[str], None] = 'o5f7b9d1e3a4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'purchase_bills',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('purchase_id', sa.Integer(), sa.ForeignKey('purchases.id'), nullable=False, unique=True),
        sa.Column('filename', sa.String(), nullable=True),
        sa.Column('content_type', sa.String(), nullable=False),
        sa.Column('data', sa.LargeBinary(), nullable=False),
        sa.Column('uploaded_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_purchase_bills_id', 'purchase_bills', ['id'])


def downgrade() -> None:
    op.drop_index('ix_purchase_bills_id', 'purchase_bills')
    op.drop_table('purchase_bills')
