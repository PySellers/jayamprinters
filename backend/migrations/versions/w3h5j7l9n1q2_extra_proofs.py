"""Further proofs (Proof 3, 4 ...) asked for when the order is taken

Revision ID: w3h5j7l9n1q2
Revises: v2g4i6k8m0p1
Create Date: 2026-11-27

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'w3h5j7l9n1q2'
down_revision: Union[str, Sequence[str], None] = 'v2g4i6k8m0p1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('quotations', sa.Column('extra_proofs', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('quotations', 'extra_proofs')
