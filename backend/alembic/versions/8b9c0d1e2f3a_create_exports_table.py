"""Create exports table."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "8b9c0d1e2f3a"
down_revision: Union[str, Sequence[str], None] = "7a8b9c0d1e2f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create exports table."""
    op.create_table(
        "exports",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("presentation_id", sa.Integer(), nullable=False),
        sa.Column("export_id", sa.String(length=100), nullable=False),
        sa.Column(
            "export_format",
            sa.Enum("MP4", "PPTX", "AUDIO_MP3", "AUDIO_WAV", name="exportformat"),
            nullable=False,
        ),
        sa.Column("file_path", sa.String(length=500), nullable=False),
        sa.Column("file_size", sa.Integer(), nullable=False),
        sa.Column("download_url", sa.String(length=500), nullable=True),
        sa.Column("include_audio", sa.Boolean(), nullable=True),
        sa.Column("include_subtitles", sa.Boolean(), nullable=True),
        sa.Column("quality", sa.String(length=20), nullable=True),
        sa.Column("status", sa.String(length=50), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("download_count", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["presentation_id"], ["presentations.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_exports_export_id"), "exports", ["export_id"], unique=True)
    op.create_index(op.f("ix_exports_id"), "exports", ["id"], unique=False)
    op.create_index(
        op.f("ix_exports_presentation_id"),
        "exports",
        ["presentation_id"],
        unique=False,
    )


def downgrade() -> None:
    """Drop exports table."""
    op.drop_index(op.f("ix_exports_presentation_id"), table_name="exports")
    op.drop_index(op.f("ix_exports_id"), table_name="exports")
    op.drop_index(op.f("ix_exports_export_id"), table_name="exports")
    op.drop_table("exports")
