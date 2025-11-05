"""Seed test user

Revision ID: c89990881f55
Revises: 0e4cedb49361
Create Date: 2025-10-16 00:09:56.839031

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import bcrypt


# revision identifiers, used by Alembic.
revision: str = 'c89990881f55'
down_revision: Union[str, Sequence[str], None] = '0e4cedb49361'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema - add test user."""
    users_table = sa.table(
        'users',
        sa.column('username', sa.String),
        sa.column('email', sa.String),
        sa.column('hashed_password', sa.String),
        sa.column('disabled', sa.Boolean),
        sa.column('is_admin', sa.Boolean),
    )
    
    password = "testpass".encode('utf-8')
    hashed = bcrypt.hashpw(password, bcrypt.gensalt()).decode('utf-8')
    
    op.bulk_insert(
        users_table,
        [
            {
                'username': 'testuser',
                'email': 'test@example.com',
                'hashed_password': hashed,
                'disabled': False,
                'is_admin': True,
            }
        ]
    )


def downgrade() -> None:
    """Downgrade schema - remove test user."""
    op.execute("DELETE FROM users WHERE username = 'testuser'")
