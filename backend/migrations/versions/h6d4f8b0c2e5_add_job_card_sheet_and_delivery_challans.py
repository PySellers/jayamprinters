"""Add job card sheet data and delivery challans

Revision ID: h6d4f8b0c2e5
Revises: g5c3e7a9b1d4
Create Date: 2026-10-08 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'h6d4f8b0c2e5'
down_revision: Union[str, Sequence[str], None] = 'g5c3e7a9b1d4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('job_cards', sa.Column('sheet_data', sa.JSON(), nullable=True))

    op.create_table(
        'delivery_challans',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('financial_year', sa.Integer(), nullable=False),
        sa.Column('dc_number', sa.Integer(), nullable=False),
        sa.Column('job_card_id', sa.Integer(), nullable=True),
        sa.Column('customer_id', sa.Integer(), nullable=False),
        sa.Column('challan_date', sa.Date(), nullable=False),
        sa.Column('to_text', sa.String(), nullable=True),
        sa.Column('items', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['job_card_id'], ['job_cards.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['customer_id'], ['customers.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('job_card_id', name='uq_dc_job_card'),
        # S.No. restarts every April: unique per financial year, not globally.
        sa.UniqueConstraint('financial_year', 'dc_number', name='uq_dc_fy_number'),
    )
    op.create_index(op.f('ix_delivery_challans_id'), 'delivery_challans', ['id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_delivery_challans_id'), table_name='delivery_challans')
    op.drop_table('delivery_challans')
    op.drop_column('job_cards', 'sheet_data')