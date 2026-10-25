"""Outsource jobs (work sent to outside companies)

Revision ID: o5f7b9d1e3a4
Revises: n4e6a8c0d2f3
Create Date: 2026-10-26

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'o5f7b9d1e3a4'
down_revision: Union[str, Sequence[str], None] = 'n4e6a8c0d2f3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    status = sa.Enum('sent', 'in_progress', 'received', 'delivered', 'cancelled', name='outsourcestatus')
    op.create_table(
        'outsource_jobs',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('job_number', sa.String()),
        sa.Column('vendor_id', sa.Integer(), sa.ForeignKey('vendors.id'), nullable=True),
        sa.Column('vendor_name', sa.String(), nullable=True),
        sa.Column('customer_id', sa.Integer(), sa.ForeignKey('customers.id'), nullable=True),
        sa.Column('job_card_id', sa.Integer(), sa.ForeignKey('job_cards.id'), nullable=True),
        sa.Column('service', sa.String(), nullable=False),
        sa.Column('description', sa.String(), nullable=True),
        sa.Column('size', sa.String(), nullable=True),
        sa.Column('quantity', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('sent_date', sa.Date(), nullable=True),
        sa.Column('expected_date', sa.Date(), nullable=True),
        sa.Column('received_date', sa.Date(), nullable=True),
        sa.Column('status', status, nullable=False, server_default='sent'),
        sa.Column('cost_amount', sa.Float(), nullable=False, server_default='0'),
        sa.Column('customer_price', sa.Float(), nullable=False, server_default='0'),
        sa.Column('amount_paid', sa.Float(), nullable=False, server_default='0'),
        sa.Column('notes', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_outsource_jobs_id', 'outsource_jobs', ['id'])
    op.create_index('ix_outsource_jobs_job_number', 'outsource_jobs', ['job_number'], unique=True)


def downgrade() -> None:
    op.drop_index('ix_outsource_jobs_job_number', 'outsource_jobs')
    op.drop_index('ix_outsource_jobs_id', 'outsource_jobs')
    op.drop_table('outsource_jobs')
    sa.Enum(name='outsourcestatus').drop(op.get_bind(), checkfirst=True)
