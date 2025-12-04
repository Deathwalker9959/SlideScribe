"""Add voice_profiles table

Revision ID: 001
Revises: ebf8fd082fd7
Create Date: 2025-12-03

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "001"
down_revision: Union[str, Sequence[str], None] = "8b9c0d1e2f3a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('voice_profiles',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('owner_id', sa.String(length=255), nullable=True),
    sa.Column('name', sa.String(length=100), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('voice', sa.String(length=100), nullable=False),
    sa.Column('language', sa.String(length=20), nullable=False),
    sa.Column('style', sa.String(length=100), nullable=True),
    sa.Column('speed', sa.Float(), nullable=False, server_default='1.0'),
    sa.Column('pitch', sa.Float(), nullable=False, server_default='0.0'),
    sa.Column('volume', sa.Float(), nullable=False, server_default='1.0'),
    sa.Column('sample_text', sa.Text(), nullable=True),
    sa.Column('tags', sa.JSON(), nullable=True),
    sa.Column('voice_type', sa.Enum('preset', 'custom_cloned', name='voicetype'), nullable=False, server_default='preset'),
    sa.Column('audio_sample_path', sa.String(length=500), nullable=True),
    sa.Column('cloning_provider', sa.String(length=50), nullable=True),
    sa.Column('sample_metadata', sa.JSON(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=True),
    sa.Column('last_used_at', sa.DateTime(), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_voice_profiles_id'), 'voice_profiles', ['id'], unique=False)
    op.create_index(op.f('ix_voice_profiles_owner_id'), 'voice_profiles', ['owner_id'], unique=False)
    op.create_index(op.f('ix_voice_profiles_voice'), 'voice_profiles', ['voice'], unique=False)
    op.create_index(op.f('ix_voice_profiles_created_at'), 'voice_profiles', ['created_at'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_voice_profiles_created_at'), table_name='voice_profiles')
    op.drop_index(op.f('ix_voice_profiles_voice'), table_name='voice_profiles')
    op.drop_index(op.f('ix_voice_profiles_owner_id'), table_name='voice_profiles')
    op.drop_index(op.f('ix_voice_profiles_id'), table_name='voice_profiles')
    op.drop_table('voice_profiles')
