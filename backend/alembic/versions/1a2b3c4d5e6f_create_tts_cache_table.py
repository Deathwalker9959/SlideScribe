"""Create tts_cache table."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "1a2b3c4d5e6f"
down_revision: Union[str, Sequence[str], None] = "ebf8fd082fd7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create tts_cache table."""
    op.create_table(
        "tts_cache",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("content_hash", sa.String(length=64), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("voice", sa.String(length=100), nullable=False),
        sa.Column("language", sa.String(length=10), nullable=True),
        sa.Column("speed", sa.Float(), nullable=True),
        sa.Column("pitch", sa.Float(), nullable=True),
        sa.Column("volume", sa.Float(), nullable=True),
        sa.Column("file_path", sa.String(length=500), nullable=False),
        sa.Column("file_size", sa.Integer(), nullable=False),
        sa.Column("duration", sa.Float(), nullable=False),
        sa.Column("format", sa.String(length=10), nullable=True),
        sa.Column("hit_count", sa.Integer(), nullable=True),
        sa.Column("processing_time", sa.Float(), nullable=True),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("last_accessed", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_tts_cache_content_hash"), "tts_cache", ["content_hash"], unique=False)
    op.create_index(op.f("ix_tts_cache_id"), "tts_cache", ["id"], unique=False)


def downgrade() -> None:
    """Drop tts_cache table."""
    op.drop_index(op.f("ix_tts_cache_id"), table_name="tts_cache")
    op.drop_index(op.f("ix_tts_cache_content_hash"), table_name="tts_cache")
    op.drop_table("tts_cache")
