"""Client round 9: editable final amount, GST invoice edit, Credit / Debit book, invitation amounts and scoped drop-downs

Revision ID: u1f3h5j7l9n0
Revises: t0e2g4i6k8m9
Create Date: 2026-11-18

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'u1f3h5j7l9n0'
down_revision: Union[str, Sequence[str], None] = 't0e2g4i6k8m9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # quotations / invoices: the typed final amount (round off) and the invoice's own bill-to details
    op.add_column('quotations', sa.Column('adjustment_amount', sa.Float(), nullable=False, server_default='0'))
    op.add_column('invoices', sa.Column('adjustment_amount', sa.Float(), nullable=False, server_default='0'))
    for col in ('bill_to_name', 'bill_to_address', 'bill_to_gstin', 'bill_to_phone', 'last_edited_by'):
        op.add_column('invoices', sa.Column(col, sa.String(), nullable=True))
    op.add_column('invoices', sa.Column('last_edited_at', sa.DateTime(), nullable=True))

    # lines: card amount / printing charge typed by the counter, typed 'Custom' texts
    for table in ('quotation_items', 'invoice_items'):
        op.add_column(table, sa.Column('card_amount', sa.Float(), nullable=True))
        op.add_column(table, sa.Column('card_amount_mode', sa.String(), nullable=True))
        op.add_column(table, sa.Column('printing_charge_manual', sa.Float(), nullable=True))
        op.add_column(table, sa.Column('option_texts', sa.JSON(), nullable=True))
    # invoice lines edited on the invoice (free lines have no product)
    op.add_column('invoice_items', sa.Column('particulars', sa.String(), nullable=True))
    for col in ('cgst_rate', 'sgst_rate', 'cgst_amount', 'sgst_amount'):
        op.add_column('invoice_items', sa.Column(col, sa.Float(), nullable=True))
    op.alter_column('invoice_items', 'product_id', existing_type=sa.Integer(), nullable=True)

    op.add_column('products', sa.Column('allow_manual_amounts', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('attributes', sa.Column('product_id', sa.Integer(), sa.ForeignKey('products.id'), nullable=True))

    op.create_table(
        'credit_debit_entries',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('kind', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('note', sa.String(), nullable=True),
        sa.Column('entry_date', sa.Date(), nullable=False),
        sa.Column('created_by', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_credit_debit_entries_kind', 'credit_debit_entries', ['kind'])
    op.create_index('ix_credit_debit_entries_name', 'credit_debit_entries', ['name'])
    op.create_index('ix_credit_debit_entries_entry_date', 'credit_debit_entries', ['entry_date'])
    op.create_table(
        'invoice_edits',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('invoice_id', sa.Integer(), sa.ForeignKey('invoices.id', ondelete='CASCADE'), nullable=False),
        sa.Column('edited_by', sa.String(), nullable=True),
        sa.Column('edited_at', sa.DateTime(), nullable=True),
        sa.Column('summary', sa.String(), nullable=True),
    )
    op.create_index('ix_invoice_edits_invoice_id', 'invoice_edits', ['invoice_id'])


def downgrade() -> None:
    op.drop_table('invoice_edits')
    op.drop_table('credit_debit_entries')
    op.drop_column('attributes', 'product_id')
    op.drop_column('products', 'allow_manual_amounts')
    op.alter_column('invoice_items', 'product_id', existing_type=sa.Integer(), nullable=False)
    for col in ('sgst_amount', 'cgst_amount', 'sgst_rate', 'cgst_rate', 'particulars'):
        op.drop_column('invoice_items', col)
    for table in ('invoice_items', 'quotation_items'):
        for col in ('option_texts', 'printing_charge_manual', 'card_amount_mode', 'card_amount'):
            op.drop_column(table, col)
    for col in ('last_edited_at', 'last_edited_by', 'bill_to_phone', 'bill_to_gstin', 'bill_to_address', 'bill_to_name', 'adjustment_amount'):
        op.drop_column('invoices', col)
    op.drop_column('quotations', 'adjustment_amount')
