"""
Presentation model - PowerPoint presentations
"""

from datetime import datetime

from sqlalchemy import JSON, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from database import Base


class Presentation(Base):
    """Presentation project model"""

    __tablename__ = "presentations"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    file_path = Column(String(500), nullable=True)  # Original PPTX file
    thumbnail_path = Column(String(500), nullable=True)
    slide_count = Column(Integer, default=0)
    settings = Column(JSON, default={})
    presentation_metadata = Column(JSON, default={})
    status = Column(String(50), default="draft")  # draft, processing, completed, error
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="presentations")
    slides = relationship("Slide", back_populates="presentation", cascade="all, delete-orphan")
    exports = relationship("Export", back_populates="presentation", cascade="all, delete-orphan")
