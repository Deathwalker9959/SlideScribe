"""Create subtitles table."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "6f7a8b9c0d1e"
down_revision: Union[str, Sequence[str], None] = "5e6f7a8b9c0d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create subtitles table."""
    op.create_table(
        "subtitles",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("slide_id", sa.Integer(), nullable=False),
        sa.Column("file_path", sa.String(length=500), nullable=True),
        sa.Column("format", sa.String(length=10), nullable=True),
        sa.Column("language", sa.String(length=10), nullable=True),
        sa.Column("segments", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["slide_id"], ["slides.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_subtitles_id"), "subtitles", ["id"], unique=False)
    op.create_index(op.f("ix_subtitles_slide_id"), "subtitles", ["slide_id"], unique=False)


def downgrade() -> None:
    """Drop subtitles table."""
    op.drop_index(op.f("ix_subtitles_slide_id"), table_name="subtitles")
    op.drop_index(op.f("ix_subtitles_id"), table_name="subtitles")
    op.drop_table("subtitles")
