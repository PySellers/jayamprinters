"""Add vendors, inventory items, purchases, cash ledger, and cheque tracking

Revision ID: c7d8e2f4a1b6
Revises: b2c4a9e1f3d7
Create Date: 2026-08-15 00:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c7d8e2f4a1b6'
down_revision: Union[str, Sequence[str], None] = 'b2c4a9e1f3d7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'vendors',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('phone', sa.String(), nullable=True),
        sa.Column('email', sa.String(), nullable=True),
        sa.Column('address', sa.String(), nullable=True),
        sa.Column('gstin', sa.String(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_vendors_id'), 'vendors', ['id'], unique=False)

    op.create_table(
        'inventory_items',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('unit', sa.String(), nullable=False),
        sa.Column('current_qty', sa.Float(), nullable=False),
        sa.Column('reorder_threshold', sa.Float(), nullable=False),
        sa.Column('notes', sa.String(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name'),
    )
    op.create_index(op.f('ix_inventory_items_id'), 'inventory_items', ['id'], unique=False)

    op.create_table(
        'purchases',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('purchase_number', sa.String(), nullable=True),
        sa.Column('vendor_id', sa.Integer(), nullable=True),
        sa.Column('purchase_date', sa.Date(), nullable=True),
        sa.Column('total_amount', sa.Float(), nullable=True),
        sa.Column('paid_amount', sa.Float(), nullable=True),
        sa.Column('status', sa.Enum('unpaid', 'partially_paid', 'paid', name='purchasestatus'), nullable=True),
        sa.Column('notes', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['vendor_id'], ['vendors.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_purchases_id'), 'purchases', ['id'], unique=False)
    op.create_index(op.f('ix_purchases_purchase_number'), 'purchases', ['purchase_number'], unique=True)

    op.create_table(
        'purchase_items',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('purchase_id', sa.Integer(), nullable=True),
        sa.Column('inventory_item_id', sa.Integer(), nullable=True),
        sa.Column('quantity', sa.Float(), nullable=False),
        sa.Column('unit_price', sa.Float(), nullable=False),
        sa.Column('total_price', sa.Float(), nullable=False),
        sa.ForeignKeyConstraint(['purchase_id'], ['purchases.id'], ),
        sa.ForeignKeyConstraint(['inventory_item_id'], ['inventory_items.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_purchase_items_id'), 'purchase_items', ['id'], unique=False)

    # Reuses the same 'paymentmethod' enum type invoices.payments already
    # created (checkfirst=True so this migration is also replayable standalone
    # against a DB that doesn't have it yet, e.g. a future squashed history).
    payment_method_enum = sa.Enum('cash', 'upi', 'card', 'credit', 'bank_transfer', name='paymentmethod')
    payment_method_enum.create(op.get_bind(), checkfirst=True)
    op.create_table(
        'purchase_payments',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('purchase_id', sa.Integer(), nullable=True),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('method', payment_method_enum, nullable=True),
        sa.Column('reference_number', sa.String(), nullable=True),
        sa.Column('payment_date', sa.Date(), nullable=True),
        sa.Column('notes', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['purchase_id'], ['purchases.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_purchase_payments_id'), 'purchase_payments', ['id'], unique=False)

    op.create_table(
        'cash_transactions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('txn_type', sa.Enum('receipt', 'payment', 'bank_deposit', name='cashtxntype'), nullable=False),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('note', sa.String(), nullable=True),
        sa.Column('created_by', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_cash_transactions_id'), 'cash_transactions', ['id'], unique=False)

    op.create_table(
        'cheque_transactions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('direction', sa.Enum('issued', 'deposited', name='chequedirection'), nullable=False),
        sa.Column('cheque_no', sa.String(), nullable=False),
        sa.Column('cheque_date', sa.Date(), nullable=True),
        sa.Column('bank_branch', sa.String(), nullable=True),
        sa.Column('deposit_date', sa.Date(), nullable=True),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('status', sa.Enum('pending', 'cleared', 'bounced', name='chequestatus'), nullable=False),
        sa.Column('party_name', sa.String(), nullable=True),
        sa.Column('notes', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_cheque_transactions_id'), 'cheque_transactions', ['id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_cheque_transactions_id'), table_name='cheque_transactions')
    op.drop_table('cheque_transactions')
    op.drop_index(op.f('ix_cash_transactions_id'), table_name='cash_transactions')
    op.drop_table('cash_transactions')
    op.drop_index(op.f('ix_purchase_payments_id'), table_name='purchase_payments')
    op.drop_table('purchase_payments')
    op.drop_index(op.f('ix_purchase_items_id'), table_name='purchase_items')
    op.drop_table('purchase_items')
    op.drop_index(op.f('ix_purchases_purchase_number'), table_name='purchases')
    op.drop_index(op.f('ix_purchases_id'), table_name='purchases')
    op.drop_table('purchases')
    op.drop_index(op.f('ix_inventory_items_id'), table_name='inventory_items')
    op.drop_table('inventory_items')
    op.drop_index(op.f('ix_vendors_id'), table_name='vendors')
    op.drop_table('vendors')

    bind = op.get_bind()
    sa.Enum(name='purchasestatus').drop(bind, checkfirst=True)
    sa.Enum(name='cashtxntype').drop(bind, checkfirst=True)
    sa.Enum(name='chequedirection').drop(bind, checkfirst=True)
    sa.Enum(name='chequestatus').drop(bind, checkfirst=True)
