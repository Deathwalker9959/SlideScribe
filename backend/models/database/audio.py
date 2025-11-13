"""
Audio file model - Generated TTS audio for slides
"""

from datetime import datetime

from sqlalchemy import JSON, Column, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from database import Base


class AudioFile(Base):
    """Generated audio files for slides"""

    __tablename__ = "audio_files"

    id = Column(Integer, primary_key=True, index=True)
    slide_id = Column(Integer, ForeignKey("slides.id"), nullable=False, index=True)
    file_path = Column(String(500), nullable=False)
    file_size = Column(Integer, nullable=False)  # bytes
    duration = Column(Float, nullable=False)  # seconds
    format = Column(String(10), default="mp3")
    voice = Column(String(100), nullable=False)
    language = Column(String(10), default="en-US")
    speed = Column(Float, default=1.0)
    pitch = Column(Float, default=0.0)
    volume = Column(Float, default=1.0)
    settings = Column(JSON, default={})
    processing_time = Column(Float, nullable=True)  # seconds
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    slide = relationship("Slide", back_populates="audio_files")
