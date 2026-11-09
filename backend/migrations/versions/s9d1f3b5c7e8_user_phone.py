"""Client round 4: phone number on users (Contacts list)

Revision ID: s9d1f3b5c7e8
Revises: r8c0e2a4b6d7
Create Date: 2026-11-09

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 's9d1f3b5c7e8'
down_revision: Union[str, Sequence[str], None] = 'r8c0e2a4b6d7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('phone', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'phone')
