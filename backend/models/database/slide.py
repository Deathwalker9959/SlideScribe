"""
Slide model - Individual presentation slides
"""

from datetime import datetime

from sqlalchemy import JSON, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from database import Base


class Slide(Base):
    """Individual slide content and metadata"""

    __tablename__ = "slides"

    id = Column(Integer, primary_key=True, index=True)
    presentation_id = Column(Integer, ForeignKey("presentations.id"), nullable=False, index=True)
    slide_number = Column(Integer, nullable=False)  # 1-based index
    slide_id = Column(String(100), nullable=False)  # Unique slide identifier
    title = Column(String(500), nullable=True)
    content = Column(Text, nullable=False)
    notes = Column(Text, nullable=True)
    original_content = Column(Text, nullable=True)  # Before refinement
    layout = Column(String(100), nullable=True)
    animations = Column(JSON, default=[])
    thumbnail_path = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    presentation = relationship("Presentation", back_populates="slides")
    audio_files = relationship("AudioFile", back_populates="slide", cascade="all, delete-orphan")
    subtitles = relationship("Subtitle", back_populates="slide", cascade="all, delete-orphan")
