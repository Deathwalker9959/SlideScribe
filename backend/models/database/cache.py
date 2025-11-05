"""
Cache models - AI refinement and TTS caching
"""

from datetime import datetime

from sqlalchemy import JSON, Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import relationship

from database import Base
from models.enums import TextRefinementType


class RefinementCache(Base):
    """Cache for AI text refinements to avoid duplicate processing"""

    __tablename__ = "refinement_cache"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    content_hash = Column(String(64), nullable=False, index=True)  # SHA-256 hash of input
    original_text = Column(Text, nullable=False)
    refined_text = Column(Text, nullable=False)
    refinement_type = Column(SQLEnum(TextRefinementType), nullable=False)
    target_audience = Column(String(100), nullable=True)
    tone = Column(String(50), nullable=True)
    language = Column(String(10), default="en")
    suggestions = Column(JSON, default=[])
    confidence_score = Column(Float, nullable=True)
    processing_time = Column(Float, nullable=True)
    hit_count = Column(Integer, default=0)  # Number of cache hits
    expires_at = Column(DateTime, nullable=True)  # Optional expiration
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_accessed = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="refinement_cache")


class TTSCache(Base):
    """Cache for TTS audio generation to save costs"""

    __tablename__ = "tts_cache"

    id = Column(Integer, primary_key=True, index=True)
    content_hash = Column(
        String(64), nullable=False, index=True
    )  # SHA-256 hash of text + voice settings
    text = Column(Text, nullable=False)
    voice = Column(String(100), nullable=False)
    language = Column(String(10), default="en-US")
    speed = Column(Float, default=1.0)
    pitch = Column(Float, default=0.0)
    volume = Column(Float, default=1.0)
    file_path = Column(String(500), nullable=False)
    file_size = Column(Integer, nullable=False)
    duration = Column(Float, nullable=False)
    format = Column(String(10), default="mp3")
    hit_count = Column(Integer, default=0)
    processing_time = Column(Float, nullable=True)
    expires_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_accessed = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
