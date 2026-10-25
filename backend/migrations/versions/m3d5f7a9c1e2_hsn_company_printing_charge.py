"""HSN codes, company settings, printing charge, per-line tax, bill serials

Revision ID: m3d5f7a9c1e2
Revises: l1b9d3f5a7c0
Create Date: 2026-10-26

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'm3d5f7a9c1e2'
down_revision: Union[str, Sequence[str], None] = 'l1b9d3f5a7c0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'hsn_codes',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('code', sa.String(), nullable=False),
        sa.Column('description', sa.String(), nullable=True),
        sa.Column('gst_rate', sa.Float(), nullable=False, server_default='18'),
        sa.Column('is_active', sa.Boolean(), server_default=sa.true()),
    )
    op.create_index('ix_hsn_codes_code', 'hsn_codes', ['code'], unique=True)
    op.create_index('ix_hsn_codes_id', 'hsn_codes', ['id'])

    op.create_table(
        'company_settings',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('name', sa.String(), nullable=False, server_default='Sri Jayam Printers'),
        sa.Column('tagline', sa.String()),
        sa.Column('gstin', sa.String()),
        sa.Column('state_code', sa.String(), server_default='33'),
        sa.Column('address', sa.String()),
        sa.Column('phones', sa.String()),
        sa.Column('landline', sa.String()),
        sa.Column('email', sa.String()),
        sa.Column('bank_name', sa.String()),
        sa.Column('bank_branch', sa.String()),
        sa.Column('bank_account_name', sa.String()),
        sa.Column('bank_account_no', sa.String()),
        sa.Column('bank_ifsc', sa.String()),
        sa.Column('show_bank_on_invoice', sa.Boolean(), server_default=sa.true()),
        sa.Column('next_gst_invoice_no', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('next_cash_bill_no', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('next_challan_no', sa.Integer(), nullable=False, server_default='1'),
    )

    op.add_column('product_categories', sa.Column('hsn_id', sa.Integer(), sa.ForeignKey('hsn_codes.id'), nullable=True))
    op.add_column('product_categories', sa.Column('print_charge_mode', sa.String(), nullable=True))
    op.add_column('product_categories', sa.Column('print_block_size', sa.Integer(), nullable=True))
    op.add_column('product_categories', sa.Column('print_block_rate', sa.Float(), nullable=True))
    op.add_column('product_categories', sa.Column('print_per_copy_rate', sa.Float(), nullable=True))
    op.add_column('product_categories', sa.Column('print_per_layer', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('products', sa.Column('hsn_id', sa.Integer(), sa.ForeignKey('hsn_codes.id'), nullable=True))

    op.add_column('quotation_items', sa.Column('layer_gsm_option_ids', sa.JSON(), nullable=True))
    op.add_column('quotation_items', sa.Column('print_charge', sa.Float(), nullable=False, server_default='0'))
    op.add_column('quotation_items', sa.Column('hsn_code', sa.String(), nullable=True))
    op.add_column('quotation_items', sa.Column('tax_rate', sa.Float(), nullable=False, server_default='0'))
    op.add_column('quotation_items', sa.Column('tax_amount', sa.Float(), nullable=False, server_default='0'))

    op.add_column('invoice_items', sa.Column('hsn_code', sa.String(), nullable=True))
    op.add_column('invoice_items', sa.Column('tax_rate', sa.Float(), nullable=False, server_default='0'))
    op.add_column('invoice_items', sa.Column('tax_amount', sa.Float(), nullable=False, server_default='0'))
    op.add_column('invoices', sa.Column('bill_no', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('invoices', 'bill_no')
    for c in ('tax_amount', 'tax_rate', 'hsn_code'):
        op.drop_column('invoice_items', c)
    for c in ('tax_amount', 'tax_rate', 'hsn_code', 'print_charge', 'layer_gsm_option_ids'):
        op.drop_column('quotation_items', c)
    op.drop_column('products', 'hsn_id')
    for c in ('print_per_layer', 'print_per_copy_rate', 'print_block_rate', 'print_block_size', 'print_charge_mode', 'hsn_id'):
        op.drop_column('product_categories', c)
    op.drop_table('company_settings')
    op.drop_index('ix_hsn_codes_id', 'hsn_codes')
    op.drop_index('ix_hsn_codes_code', 'hsn_codes')
    op.drop_table('hsn_codes')
