from datetime import datetime
from typing import Any

from enums import ExportFormat
from pydantic import BaseModel, Field


class SlideContent(BaseModel):
    slide_id: str
    title: str | None = None
    content: str
    notes: str | None = None
    animations: list[dict[str, Any]] = []
    layout: str | None = None


class PresentationRequest(BaseModel):
    slides: list[SlideContent]
    settings: dict[str, Any] = {}
    metadata: dict[str, Any] = {}


class ExportRequest(BaseModel):
    presentation_id: str
    export_format: ExportFormat
    include_audio: bool = True
    include_subtitles: bool = False
    quality: str = Field(default="high", pattern="^(low|medium|high)$")


class ExportResponse(BaseModel):
    export_id: str
    download_url: str
    file_size: int
    export_format: ExportFormat
    created_at: datetime
    expires_at: datetime
