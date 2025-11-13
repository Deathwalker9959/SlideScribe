"""
Export model - Presentation exports and downloads
"""

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import relationship

from database import Base
from models.enums import ExportFormat


class Export(Base):
    """Export/download records for presentations"""

    __tablename__ = "exports"

    id = Column(Integer, primary_key=True, index=True)
    presentation_id = Column(Integer, ForeignKey("presentations.id"), nullable=False, index=True)
    export_id = Column(String(100), unique=True, nullable=False, index=True)
    export_format = Column(SQLEnum(ExportFormat), nullable=False)
    file_path = Column(String(500), nullable=False)
    file_size = Column(Integer, nullable=False)
    download_url = Column(String(500), nullable=True)
    include_audio = Column(Boolean, default=True)
    include_subtitles = Column(Boolean, default=False)
    quality = Column(String(20), default="high")
    status = Column(String(50), default="processing")  # processing, completed, failed, expired
    error_message = Column(Text, nullable=True)
    download_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    expires_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    # Relationships
    presentation = relationship("Presentation", back_populates="exports")
