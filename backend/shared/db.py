"""SQLAlchemy ORM models for database tables."""

from datetime import datetime, timezone
from sqlalchemy import Column, String, Text, Float, JSON, DateTime, Enum, Integer
from database import Base


class VoiceProfileDB(Base):
    """Voice profile database model."""

    __tablename__ = "voice_profiles"

    id = Column(String(36), primary_key=True)
    owner_id = Column(String(255), nullable=True, index=True)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    voice = Column(String(100), nullable=False, index=True)
    language = Column(String(20), nullable=False)
    style = Column(String(100), nullable=True)
    speed = Column(Float, nullable=False, default=1.0)
    pitch = Column(Float, nullable=False, default=0.0)
    volume = Column(Float, nullable=False, default=1.0)
    sample_text = Column(Text, nullable=True)
    tags = Column(JSON, nullable=True)
    voice_type = Column(Enum("preset", "custom_cloned", name="voicetype"), nullable=False, default="preset")
    audio_sample_path = Column(String(500), nullable=True)
    cloning_provider = Column(String(50), nullable=True)
    sample_metadata = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), index=True)
    updated_at = Column(DateTime(timezone=True), nullable=True)
    last_used_at = Column(DateTime(timezone=True), nullable=True)

    def __repr__(self) -> str:
        return f"<VoiceProfileDB(id={self.id}, name={self.name}, voice={self.voice})>"
