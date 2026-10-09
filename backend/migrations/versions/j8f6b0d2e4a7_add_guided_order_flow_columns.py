"""Add guided-order columns: category guided_flow, attribute in_price_matrix, extra-charge group/requires

Revision ID: j8f6b0d2e4a7
Revises: i7e5a9c1d3f6
Create Date: 2026-10-10

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'j8f6b0d2e4a7'
down_revision: Union[str, Sequence[str], None] = 'i7e5a9c1d3f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('product_categories', sa.Column('guided_flow', sa.String(), nullable=True))
    # Existing attributes all keep forming part of the price-matrix key.
    op.add_column('attributes', sa.Column('in_price_matrix', sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column('extra_charges', sa.Column('group_name', sa.String(), nullable=True))
    op.add_column('extra_charges', sa.Column('requires_option_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_extra_charges_requires_option', 'extra_charges', 'attribute_options',
        ['requires_option_id'], ['id'],
    )


def downgrade() -> None:
    op.drop_constraint('fk_extra_charges_requires_option', 'extra_charges', type_='foreignkey')
    op.drop_column('extra_charges', 'requires_option_id')
    op.drop_column('extra_charges', 'group_name')
    op.drop_column('attributes', 'in_price_matrix')
    op.drop_column('product_categories', 'guided_flow')
