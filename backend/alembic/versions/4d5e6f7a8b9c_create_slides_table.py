"""Create slides table."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "4d5e6f7a8b9c"
down_revision: Union[str, Sequence[str], None] = "3c4d5e6f7a8b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create slides table."""
    op.create_table(
        "slides",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("presentation_id", sa.Integer(), nullable=False),
        sa.Column("slide_number", sa.Integer(), nullable=False),
        sa.Column("slide_id", sa.String(length=100), nullable=False),
        sa.Column("title", sa.String(length=500), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("original_content", sa.Text(), nullable=True),
        sa.Column("layout", sa.String(length=100), nullable=True),
        sa.Column("animations", sa.JSON(), nullable=True),
        sa.Column("thumbnail_path", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["presentation_id"], ["presentations.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_slides_id"), "slides", ["id"], unique=False)
    op.create_index(op.f("ix_slides_presentation_id"), "slides", ["presentation_id"], unique=False)


def downgrade() -> None:
    """Drop slides table."""
    op.drop_index(op.f("ix_slides_presentation_id"), table_name="slides")
    op.drop_index(op.f("ix_slides_id"), table_name="slides")
    op.drop_table("slides")
