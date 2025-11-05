"""
Processing job model - Background task tracking
"""

from datetime import datetime

from sqlalchemy import JSON, Column, DateTime, Integer, String, Text

from database import Base


class ProcessingJob(Base):
    """Background job tracking for async processing"""

    __tablename__ = "processing_jobs"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(String(100), unique=True, nullable=False, index=True)
    job_type = Column(String(50), nullable=False)  # tts, refinement, export, etc.
    status = Column(String(50), default="pending")  # pending, processing, completed, failed
    entity_type = Column(String(50), nullable=True)  # presentation, slide, etc.
    entity_id = Column(Integer, nullable=True)
    input_data = Column(JSON, default={})
    output_data = Column(JSON, default={})
    error_message = Column(Text, nullable=True)
    progress_percent = Column(Integer, default=0)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
