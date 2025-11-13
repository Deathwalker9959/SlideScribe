"""
Analytics model - API usage tracking and thesis metrics
"""

from datetime import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Boolean, JSON

from database import Base


class APIUsage(Base):
    """Track API usage for billing and analytics"""

    __tablename__ = "api_usage"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    endpoint = Column(String(200), nullable=False, index=True)
    method = Column(String(10), nullable=False)
    status_code = Column(Integer, nullable=False)
    response_time = Column(Float, nullable=False)  # milliseconds
    request_size = Column(Integer, nullable=True)  # bytes
    response_size = Column(Integer, nullable=True)  # bytes
    ip_address = Column(String(50), nullable=True)
    user_agent = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)


class JobMetrics(Base):
    """Track job performance and user behavior metrics for thesis research"""

    __tablename__ = "job_metrics"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(String(100), nullable=False, unique=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    presentation_id = Column(String(100), nullable=True, index=True)

    # Job timing metrics
    started_at = Column(DateTime, nullable=False)
    completed_at = Column(DateTime, nullable=True)
    total_duration_ms = Column(Float, nullable=True)  # Total job time in milliseconds

    # Content metrics
    total_slides = Column(Integer, nullable=False)
    total_characters = Column(Integer, nullable=False)  # Original text length
    refined_characters = Column(Integer, nullable=True)  # After AI refinement
    edit_count = Column(Integer, nullable=False, default=0)  # Number of user edits

    # TTS metrics
    synthesis_provider = Column(String(50), nullable=True)  # azure, openai, etc.
    synthesis_duration_ms = Column(Float, nullable=True)  # Time spent in TTS
    synthesis_degraded = Column(Boolean, nullable=False, default=False)  # Fallback used?

    # AI refinement metrics
    refinement_enabled = Column(Boolean, nullable=False, default=False)
    refinement_duration_ms = Column(Float, nullable=True)
    refinement_iterations = Column(Integer, nullable=False, default=0)

    # Performance metrics (latency percentiles in ms)
    slide_processing_p50 = Column(Float, nullable=True)
    slide_processing_p95 = Column(Float, nullable=True)

    # User interaction metrics
    preview_count = Column(Integer, nullable=False, default=0)  # Number of TTS previews
    voice_changes = Column(Integer, nullable=False, default=0)  # Voice setting changes
    language_changes = Column(Integer, nullable=False, default=0)  # Language changes

    # Export metrics
    export_formats = Column(JSON, nullable=True)  # List of exported formats
    export_count = Column(Integer, nullable=False, default=0)

    # Additional metadata (JSON)
    job_metadata = Column(JSON, nullable=True)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class UserFeedback(Base):
    """Track SUS (System Usability Scale) feedback and other user satisfaction metrics"""

    __tablename__ = "user_feedback"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(String(100), nullable=True, index=True)  # Associated job if applicable
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)

    # SUS scores (1-5 scale for each question)
    sus_q1 = Column(Integer, nullable=True)  # Complex/simple
    sus_q2 = Column(Integer, nullable=True)  # Cumbersome/easy
    sus_q3 = Column(Integer, nullable=True)  # Needs technical help
    sus_q4 = Column(Integer, nullable=True)  # Functions integrated
    sus_q5 = Column(Integer, nullable=True)  # Inconsistent/consistent
    sus_q6 = Column(Integer, nullable=True)  # People would learn quickly
    sus_q7 = Column(Integer, nullable=True)  # Cumbersome/cumbersome
    sus_q8 = Column(Integer, nullable=True)  # Technical help needed
    sus_q9 = Column(Integer, nullable=True)  # Confident/unsure
    sus_q10 = Column(Integer, nullable=True)  # Learn system before using

    # Calculated SUS score (0-100)
    sus_score = Column(Float, nullable=True)

    # Additional feedback
    feedback_text = Column(String(1000), nullable=True)
    rating = Column(Integer, nullable=True)  # 1-5 stars
    issues = Column(JSON, nullable=True)  # List of reported issues
    suggestions = Column(JSON, nullable=True)  # List of suggestions

    # Context information
    context = Column(JSON, nullable=True)  # Additional context about usage

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
