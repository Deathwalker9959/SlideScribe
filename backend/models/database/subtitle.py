"""
Subtitle model - Captions for slide audio
"""

from datetime import datetime

from sqlalchemy import JSON, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from database import Base


class Subtitle(Base):
    """Subtitle/caption data for slides"""

    __tablename__ = "subtitles"

    id = Column(Integer, primary_key=True, index=True)
    slide_id = Column(Integer, ForeignKey("slides.id"), nullable=False, index=True)
    file_path = Column(String(500), nullable=True)  # SRT/VTT file path
    format = Column(String(10), default="srt")  # srt, vtt, json
    language = Column(String(10), default="en-US")
    segments = Column(JSON, default=[])  # [{"start": 0.0, "end": 1.5, "text": "Hello"}]
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    slide = relationship("Slide", back_populates="subtitles")
