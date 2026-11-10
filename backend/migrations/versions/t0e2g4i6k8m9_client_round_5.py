"""Client round 5: item sub-categories, pay-by date, payment details + proofs, customer / one-time stock, job materials

Revision ID: t0e2g4i6k8m9
Revises: s9d1f3b5c7e8
Create Date: 2026-11-09

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 't0e2g4i6k8m9'
down_revision: Union[str, Sequence[str], None] = 's9d1f3b5c7e8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('products', sa.Column('sub_category', sa.String(), nullable=True))
    op.add_column('invoices', sa.Column('pay_by_date', sa.Date(), nullable=True))
    op.add_column('payments', sa.Column('upi_id', sa.String(), nullable=True))
    op.add_column('payments', sa.Column('bank_details', sa.String(), nullable=True))
    op.add_column('payments', sa.Column('is_advance', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('purchase_payments', sa.Column('upi_id', sa.String(), nullable=True))
    op.add_column('purchase_payments', sa.Column('bank_details', sa.String(), nullable=True))
    op.add_column('inventory_items', sa.Column('customer_id', sa.Integer(), sa.ForeignKey('customers.id'), nullable=True))
    op.alter_column('purchase_items', 'inventory_item_id', existing_type=sa.Integer(), nullable=True)
    op.add_column('purchase_items', sa.Column('custom_name', sa.String(), nullable=True))

    op.create_table(
        'outsource_payments',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('job_id', sa.Integer(), sa.ForeignKey('outsource_jobs.id'), nullable=False),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('method', sa.String(), nullable=True),
        sa.Column('reference_number', sa.String(), nullable=True),
        sa.Column('upi_id', sa.String(), nullable=True),
        sa.Column('bank_details', sa.String(), nullable=True),
        sa.Column('payment_date', sa.Date(), nullable=True),
        sa.Column('notes', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_outsource_payments_job_id', 'outsource_payments', ['job_id'])
    op.create_table(
        'payment_proofs',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('kind', sa.String(), nullable=False),
        sa.Column('payment_id', sa.Integer(), nullable=False),
        sa.Column('filename', sa.String(), nullable=True),
        sa.Column('content_type', sa.String(), nullable=False),
        sa.Column('data', sa.LargeBinary(), nullable=False),
        sa.Column('uploaded_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_payment_proofs_kind', 'payment_proofs', ['kind'])
    op.create_index('ix_payment_proofs_payment_id', 'payment_proofs', ['payment_id'])
    op.create_table(
        'job_materials',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('job_card_id', sa.Integer(), sa.ForeignKey('job_cards.id', ondelete='CASCADE'), nullable=False),
        sa.Column('inventory_item_id', sa.Integer(), sa.ForeignKey('inventory_items.id'), nullable=False),
        sa.Column('quantity', sa.Float(), nullable=False),
        sa.Column('note', sa.String(), nullable=True),
        sa.Column('created_by', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_job_materials_job_card_id', 'job_materials', ['job_card_id'])


def downgrade() -> None:
    op.drop_table('job_materials')
    op.drop_table('payment_proofs')
    op.drop_table('outsource_payments')
    op.drop_column('purchase_items', 'custom_name')
    op.alter_column('purchase_items', 'inventory_item_id', existing_type=sa.Integer(), nullable=False)
    op.drop_column('inventory_items', 'customer_id')
    op.drop_column('purchase_payments', 'bank_details')
    op.drop_column('purchase_payments', 'upi_id')
    op.drop_column('payments', 'is_advance')
    op.drop_column('payments', 'bank_details')
    op.drop_column('payments', 'upi_id')
    op.drop_column('invoices', 'pay_by_date')
    op.drop_column('products', 'sub_category')
