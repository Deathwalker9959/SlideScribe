"""
PowerPoint presentation models for handling slide content and exports.
"""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from .enums import ExportFormat


class SlideContent(BaseModel):
    """Model for individual slide content."""

    slide_id: str
    title: str | None = None
    content: str
    notes: str | None = None
    animations: list[dict[str, Any]] = []
    layout: str | None = None


class PresentationRequest(BaseModel):
    """Request model for creating a presentation."""

    slides: list[SlideContent]
    settings: dict[str, Any] = {}
    metadata: dict[str, Any] = {}


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
