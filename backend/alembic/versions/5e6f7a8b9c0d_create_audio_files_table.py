"""Create audio_files table."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "5e6f7a8b9c0d"
down_revision: Union[str, Sequence[str], None] = "4d5e6f7a8b9c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create audio_files table."""
    op.create_table(
        "audio_files",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("slide_id", sa.Integer(), nullable=False),
        sa.Column("file_path", sa.String(length=500), nullable=False),
        sa.Column("file_size", sa.Integer(), nullable=False),
        sa.Column("duration", sa.Float(), nullable=False),
        sa.Column("format", sa.String(length=10), nullable=True),
        sa.Column("voice", sa.String(length=100), nullable=False),
        sa.Column("language", sa.String(length=10), nullable=True),
        sa.Column("speed", sa.Float(), nullable=True),
        sa.Column("pitch", sa.Float(), nullable=True),
        sa.Column("volume", sa.Float(), nullable=True),
        sa.Column("settings", sa.JSON(), nullable=True),
        sa.Column("processing_time", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["slide_id"], ["slides.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_audio_files_id"), "audio_files", ["id"], unique=False)
    op.create_index(op.f("ix_audio_files_slide_id"), "audio_files", ["slide_id"], unique=False)


def downgrade() -> None:
    """Drop audio_files table."""
    op.drop_index(op.f("ix_audio_files_slide_id"), table_name="audio_files")
    op.drop_index(op.f("ix_audio_files_id"), table_name="audio_files")
    op.drop_table("audio_files")
