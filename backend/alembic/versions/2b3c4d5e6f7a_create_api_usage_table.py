"""Create api_usage table."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "2b3c4d5e6f7a"
down_revision: Union[str, Sequence[str], None] = "1a2b3c4d5e6f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create api_usage table."""
    op.create_table(
        "api_usage",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("endpoint", sa.String(length=200), nullable=False),
        sa.Column("method", sa.String(length=10), nullable=False),
        sa.Column("status_code", sa.Integer(), nullable=False),
        sa.Column("response_time", sa.Float(), nullable=False),
        sa.Column("request_size", sa.Integer(), nullable=True),
        sa.Column("response_size", sa.Integer(), nullable=True),
        sa.Column("ip_address", sa.String(length=50), nullable=True),
        sa.Column("user_agent", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_api_usage_created_at"), "api_usage", ["created_at"], unique=False)
    op.create_index(op.f("ix_api_usage_endpoint"), "api_usage", ["endpoint"], unique=False)
    op.create_index(op.f("ix_api_usage_id"), "api_usage", ["id"], unique=False)
    op.create_index(op.f("ix_api_usage_user_id"), "api_usage", ["user_id"], unique=False)


def downgrade() -> None:
    """Drop api_usage table."""
    op.drop_index(op.f("ix_api_usage_user_id"), table_name="api_usage")
    op.drop_index(op.f("ix_api_usage_id"), table_name="api_usage")
    op.drop_index(op.f("ix_api_usage_endpoint"), table_name="api_usage")
    op.drop_index(op.f("ix_api_usage_created_at"), table_name="api_usage")
    op.drop_table("api_usage")
