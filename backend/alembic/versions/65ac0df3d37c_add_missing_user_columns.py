"""Add user profile columns."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "65ac0df3d37c"
down_revision: Union[str, Sequence[str], None] = "c89990881f55"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add additional user profile columns if missing."""
    bind = op.get_bind()
    existing = {col["name"] for col in sa.inspect(bind).get_columns("users")}

    columns = [
        ("full_name", sa.Column("full_name", sa.String(length=255), nullable=True)),
        ("preferences", sa.Column("preferences", sa.JSON(), nullable=True)),
        (
            "is_active",
            sa.Column(
                "is_active",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("true"),
            ),
        ),
        (
            "created_at",
            sa.Column(
                "created_at",
                sa.DateTime(),
                nullable=False,
                server_default=sa.text("CURRENT_TIMESTAMP"),
            ),
        ),
        ("updated_at", sa.Column("updated_at", sa.DateTime(), nullable=True)),
    ]

    for name, column in columns:
        if name not in existing:
            op.add_column("users", column)


def downgrade() -> None:
    """Remove added user profile columns if present."""
    bind = op.get_bind()
    existing = {col["name"] for col in sa.inspect(bind).get_columns("users")}

    for name in ("updated_at", "created_at", "is_active", "preferences", "full_name"):
        if name in existing:
            op.drop_column("users", name)
