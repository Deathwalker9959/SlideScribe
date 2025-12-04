"""Create presentations table."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "3c4d5e6f7a8b"
down_revision: Union[str, Sequence[str], None] = "2b3c4d5e6f7a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create presentations table."""
    op.create_table(
        "presentations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("file_path", sa.String(length=500), nullable=True),
        sa.Column("thumbnail_path", sa.String(length=500), nullable=True),
        sa.Column("slide_count", sa.Integer(), nullable=True),
        sa.Column("settings", sa.JSON(), nullable=True),
        sa.Column("presentation_metadata", sa.JSON(), nullable=True),
        sa.Column("status", sa.String(length=50), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_presentations_id"), "presentations", ["id"], unique=False)
    op.create_index(op.f("ix_presentations_user_id"), "presentations", ["user_id"], unique=False)


def downgrade() -> None:
    """Drop presentations table."""
    op.drop_index(op.f("ix_presentations_user_id"), table_name="presentations")
    op.drop_index(op.f("ix_presentations_id"), table_name="presentations")
    op.drop_table("presentations")
