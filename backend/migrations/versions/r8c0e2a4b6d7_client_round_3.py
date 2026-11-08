"""Client round 3: order discount, price breakdown, per-copy paper, printing-charge bands, design proofs, minimum order quantity

Revision ID: r8c0e2a4b6d7
Revises: q7b9d1f3a5c6
Create Date: 2026-11-08

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'r8c0e2a4b6d7'
down_revision: Union[str, Sequence[str], None] = 'q7b9d1f3a5c6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('products', sa.Column('min_quantity', sa.Integer(), nullable=True))
    op.add_column('product_categories', sa.Column('extras_required', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('extra_charges', sa.Column('min_amount', sa.Float(), nullable=True))

    op.add_column('quotations', sa.Column('discount_type', sa.String(), nullable=True))
    op.add_column('quotations', sa.Column('discount_value', sa.Float(), nullable=False, server_default='0'))
    op.add_column('quotations', sa.Column('discount_amount', sa.Float(), nullable=False, server_default='0'))
    op.add_column('quotations', sa.Column('priority', sa.String(), nullable=True))

    op.add_column('quotation_items', sa.Column('layer_specs', sa.JSON(), nullable=True))
    op.add_column('quotation_items', sa.Column('custom_charges', sa.JSON(), nullable=True))
    op.add_column('quotation_items', sa.Column('price_breakdown', sa.JSON(), nullable=True))
    op.add_column('quotation_items', sa.Column('discount_amount', sa.Float(), nullable=False, server_default='0'))

    op.add_column('invoices', sa.Column('discount_type', sa.String(), nullable=True))
    op.add_column('invoices', sa.Column('discount_value', sa.Float(), nullable=False, server_default='0'))
    op.add_column('invoices', sa.Column('discount_amount', sa.Float(), nullable=False, server_default='0'))
    op.add_column('invoice_items', sa.Column('price_breakdown', sa.JSON(), nullable=True))
    op.add_column('invoice_items', sa.Column('discount_amount', sa.Float(), nullable=False, server_default='0'))

    op.create_table(
        'print_charge_bands',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('category_id', sa.Integer(), sa.ForeignKey('product_categories.id', ondelete='CASCADE'), nullable=False),
        sa.Column('min_quantity', sa.Integer(), nullable=False),
        sa.Column('max_quantity', sa.Integer(), nullable=True),
        sa.Column('amount', sa.Float(), nullable=False, server_default='0'),
        sa.Column('per_block', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('block_size', sa.Integer(), nullable=True),
    )
    op.create_index('ix_print_charge_bands_id', 'print_charge_bands', ['id'])
    op.create_index('ix_print_charge_bands_category_id', 'print_charge_bands', ['category_id'])

    op.create_table(
        'job_proofs',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('job_card_id', sa.Integer(), sa.ForeignKey('job_cards.id', ondelete='CASCADE'), nullable=False),
        sa.Column('number', sa.Integer(), nullable=False),
        sa.Column('due_date', sa.Date(), nullable=True),
        sa.Column('due_time', sa.String(), nullable=True),
        sa.Column('status', sa.String(), nullable=False, server_default='scheduled'),
        sa.Column('handled_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('notes', sa.String(), nullable=True),
        sa.Column('sent_at', sa.DateTime(), nullable=True),
        sa.Column('decided_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_job_proofs_id', 'job_proofs', ['id'])
    op.create_index('ix_job_proofs_job_card_id', 'job_proofs', ['job_card_id'])


def downgrade() -> None:
    op.drop_table('job_proofs')
    op.drop_table('print_charge_bands')
    op.drop_column('invoice_items', 'discount_amount')
    op.drop_column('invoice_items', 'price_breakdown')
    op.drop_column('invoices', 'discount_amount')
    op.drop_column('invoices', 'discount_value')
    op.drop_column('invoices', 'discount_type')
    op.drop_column('quotation_items', 'discount_amount')
    op.drop_column('quotation_items', 'price_breakdown')
    op.drop_column('quotation_items', 'custom_charges')
    op.drop_column('quotation_items', 'layer_specs')
    op.drop_column('quotations', 'priority')
    op.drop_column('quotations', 'discount_amount')
    op.drop_column('quotations', 'discount_value')
    op.drop_column('quotations', 'discount_type')
    op.drop_column('extra_charges', 'min_amount')
    op.drop_column('product_categories', 'extras_required')
    op.drop_column('products', 'min_quantity')
