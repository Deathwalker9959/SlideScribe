from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from .enums import ExportFormat

class SlideContent(BaseModel):
    slide_id: str
    title: Optional[str] = None
    content: str
    notes: Optional[str] = None
    animations: List[Dict[str, Any]] = []
    layout: Optional[str] = None

class PresentationRequest(BaseModel):
    slides: List[SlideContent]
    settings: Dict[str, Any] = {}
    metadata: Dict[str, Any] = {}

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
    created_at: 'datetime'
    expires_at: 'datetime'
