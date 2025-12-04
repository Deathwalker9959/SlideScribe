"""Create processing_jobs table."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "ebf8fd082fd7"
down_revision: Union[str, Sequence[str], None] = "65ac0df3d37c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create processing_jobs table."""
    op.create_table(
        "processing_jobs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("job_id", sa.String(length=100), nullable=False),
        sa.Column("job_type", sa.String(length=50), nullable=False),
        sa.Column("status", sa.String(length=50), nullable=True),
        sa.Column("entity_type", sa.String(length=50), nullable=True),
        sa.Column("entity_id", sa.Integer(), nullable=True),
        sa.Column("input_data", sa.JSON(), nullable=True),
        sa.Column("output_data", sa.JSON(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("progress_percent", sa.Integer(), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_processing_jobs_id"), "processing_jobs", ["id"], unique=False)
    op.create_index(op.f("ix_processing_jobs_job_id"), "processing_jobs", ["job_id"], unique=True)


def downgrade() -> None:
    """Drop processing_jobs table."""
    op.drop_index(op.f("ix_processing_jobs_job_id"), table_name="processing_jobs")
    op.drop_index(op.f("ix_processing_jobs_id"), table_name="processing_jobs")
    op.drop_table("processing_jobs")
