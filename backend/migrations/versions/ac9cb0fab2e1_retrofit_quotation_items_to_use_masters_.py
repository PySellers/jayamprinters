"""Retrofit quotation items to use masters and add quotation tax

Revision ID: ac9cb0fab2e1
Revises: f73730ecb23c
Create Date: 2026-07-28 09:15:59.897026

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ac9cb0fab2e1'
down_revision: Union[str, Sequence[str], None] = 'f73730ecb23c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Dev-only test data (e.g. QT-00001) has no product/master rows to map its
    # free-text spec fields to, so it's cleared rather than backfilled.
    op.execute("DELETE FROM quotation_items")
    op.execute("DELETE FROM quotations")

    op.add_column('quotation_items', sa.Column('product_id', sa.Integer(), nullable=True))
    op.add_column('quotation_items', sa.Column('paper_type_id', sa.Integer(), nullable=True))
    op.add_column('quotation_items', sa.Column('gsm_id', sa.Integer(), nullable=True))
    op.add_column('quotation_items', sa.Column('size_id', sa.Integer(), nullable=True))
    op.add_column('quotation_items', sa.Column('colour_id', sa.Integer(), nullable=True))
    op.add_column('quotation_items', sa.Column('binding_id', sa.Integer(), nullable=True))
    op.add_column('quotation_items', sa.Column('lamination_id', sa.Integer(), nullable=True))
    op.add_column('quotation_items', sa.Column('foiling_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_quotation_items_product_id', 'quotation_items', 'products', ['product_id'], ['id'])
    op.create_foreign_key('fk_quotation_items_paper_type_id', 'quotation_items', 'paper_types', ['paper_type_id'], ['id'])
    op.create_foreign_key('fk_quotation_items_gsm_id', 'quotation_items', 'gsms', ['gsm_id'], ['id'])
    op.create_foreign_key('fk_quotation_items_size_id', 'quotation_items', 'sizes', ['size_id'], ['id'])
    op.create_foreign_key('fk_quotation_items_colour_id', 'quotation_items', 'colours', ['colour_id'], ['id'])
    op.create_foreign_key('fk_quotation_items_binding_id', 'quotation_items', 'binding_types', ['binding_id'], ['id'])
    op.create_foreign_key('fk_quotation_items_lamination_id', 'quotation_items', 'lamination_types', ['lamination_id'], ['id'])
    op.create_foreign_key('fk_quotation_items_foiling_id', 'quotation_items', 'foiling_types', ['foiling_id'], ['id'])
    op.drop_column('quotation_items', 'product_name')
    op.drop_column('quotation_items', 'paper_type')
    op.drop_column('quotation_items', 'gsm')
    op.drop_column('quotation_items', 'size')
    op.drop_column('quotation_items', 'colour')
    op.drop_column('quotation_items', 'binding')
    op.drop_column('quotation_items', 'lamination')

    op.add_column('quotations', sa.Column('tax_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_quotations_tax_id', 'quotations', 'taxes', ['tax_id'], ['id'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('fk_quotations_tax_id', 'quotations', type_='foreignkey')
    op.drop_column('quotations', 'tax_id')

    op.add_column('quotation_items', sa.Column('lamination', sa.String(), nullable=True))
    op.add_column('quotation_items', sa.Column('binding', sa.String(), nullable=True))
    op.add_column('quotation_items', sa.Column('colour', sa.String(), nullable=True))
    op.add_column('quotation_items', sa.Column('size', sa.String(), nullable=True))
    op.add_column('quotation_items', sa.Column('gsm', sa.String(), nullable=True))
    op.add_column('quotation_items', sa.Column('paper_type', sa.String(), nullable=True))
    op.add_column('quotation_items', sa.Column('product_name', sa.String(), nullable=True))
    op.drop_constraint('fk_quotation_items_foiling_id', 'quotation_items', type_='foreignkey')
    op.drop_constraint('fk_quotation_items_lamination_id', 'quotation_items', type_='foreignkey')
    op.drop_constraint('fk_quotation_items_binding_id', 'quotation_items', type_='foreignkey')
    op.drop_constraint('fk_quotation_items_colour_id', 'quotation_items', type_='foreignkey')
    op.drop_constraint('fk_quotation_items_size_id', 'quotation_items', type_='foreignkey')
    op.drop_constraint('fk_quotation_items_gsm_id', 'quotation_items', type_='foreignkey')
    op.drop_constraint('fk_quotation_items_paper_type_id', 'quotation_items', type_='foreignkey')
    op.drop_constraint('fk_quotation_items_product_id', 'quotation_items', type_='foreignkey')
    op.drop_column('quotation_items', 'foiling_id')
    op.drop_column('quotation_items', 'lamination_id')
    op.drop_column('quotation_items', 'binding_id')
    op.drop_column('quotation_items', 'colour_id')
    op.drop_column('quotation_items', 'size_id')
    op.drop_column('quotation_items', 'gsm_id')
    op.drop_column('quotation_items', 'paper_type_id')
    op.drop_column('quotation_items', 'product_id')
