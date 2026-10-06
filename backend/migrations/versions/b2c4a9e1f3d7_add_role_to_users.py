"""Add role to users (RBAC: admin/counter/production/accounts)

Revision ID: b2c4a9e1f3d7
Revises: dd361ed76923
Create Date: 2026-08-15 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b2c4a9e1f3d7'
down_revision: Union[str, Sequence[str], None] = 'dd361ed76923'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

user_role_enum = sa.Enum('admin', 'counter', 'production', 'accounts', name='userrole')


def upgrade() -> None:
    """Upgrade schema."""
    user_role_enum.create(op.get_bind(), checkfirst=True)
    op.add_column(
        'users',
        sa.Column('role', user_role_enum, nullable=False, server_default='counter'),
    )
    # Whoever logs in first (or however you seed) should be promoted to admin
    # by hand afterwards, e.g.: UPDATE users SET role = 'admin' WHERE email = '...';
    # server_default is dropped after backfill so future inserts must set a role
    # explicitly via the application (UserCreate.role is required, see schemas/user.py).
    op.alter_column('users', 'role', server_default=None)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('users', 'role')
    user_role_enum.drop(op.get_bind(), checkfirst=True)
