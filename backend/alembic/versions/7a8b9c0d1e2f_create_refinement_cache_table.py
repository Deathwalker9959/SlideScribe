"""Create refinement_cache table."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "7a8b9c0d1e2f"
down_revision: Union[str, Sequence[str], None] = "6f7a8b9c0d1e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create refinement_cache table."""
    op.create_table(
        "refinement_cache",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("content_hash", sa.String(length=64), nullable=False),
        sa.Column("original_text", sa.Text(), nullable=False),
        sa.Column("refined_text", sa.Text(), nullable=False),
        sa.Column(
            "refinement_type",
            sa.Enum(
                "GRAMMAR",
                "STYLE",
                "TONE",
                "CLARITY",
                "FORMALITY",
                name="textrefinementtype",
            ),
            nullable=False,
        ),
        sa.Column("target_audience", sa.String(length=100), nullable=True),
        sa.Column("tone", sa.String(length=50), nullable=True),
        sa.Column("language", sa.String(length=10), nullable=True),
        sa.Column("suggestions", sa.JSON(), nullable=True),
        sa.Column("confidence_score", sa.Float(), nullable=True),
        sa.Column("processing_time", sa.Float(), nullable=True),
        sa.Column("hit_count", sa.Integer(), nullable=True),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("last_accessed", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_refinement_cache_content_hash"), "refinement_cache", ["content_hash"], unique=False)
    op.create_index(op.f("ix_refinement_cache_id"), "refinement_cache", ["id"], unique=False)
    op.create_index(op.f("ix_refinement_cache_user_id"), "refinement_cache", ["user_id"], unique=False)


def downgrade() -> None:
    """Drop refinement_cache table."""
    op.drop_index(op.f("ix_refinement_cache_user_id"), table_name="refinement_cache")
    op.drop_index(op.f("ix_refinement_cache_id"), table_name="refinement_cache")
    op.drop_index(op.f("ix_refinement_cache_content_hash"), table_name="refinement_cache")
    op.drop_table("refinement_cache")
