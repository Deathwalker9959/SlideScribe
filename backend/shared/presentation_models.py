"""
PowerPoint presentation models for handling slide content and exports.
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from .enums import ExportFormat


class SlideContent(BaseModel):
    """Model for individual slide content."""
    slide_id: str
    title: Optional[str] = None
    content: str
    notes: Optional[str] = None
    animations: List[Dict[str, Any]] = []
    layout: Optional[str] = None


class PresentationRequest(BaseModel):
    """Request model for creating a presentation."""
    slides: List[SlideContent]
    settings: Dict[str, Any] = {}
    metadata: Dict[str, Any] = {}


class ExportRequest(BaseModel):
    """Request model for exporting presentations."""
    presentation_id: str
    export_format: ExportFormat
    include_audio: bool = True
    include_subtitles: bool = False
    quality: str = Field(default="high", pattern="^(low|medium|high)$")


class ExportResponse(BaseModel):
    """Response model for export operations."""
    export_id: str
    download_url: str
    file_size: int
    export_format: ExportFormat
    created_at: datetime
    expires_at: datetime
