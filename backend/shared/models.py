from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


class VoiceGender(str, Enum):
    MALE = "male"
    FEMALE = "female"
    NEUTRAL = "neutral"


class TextRefinementType(str, Enum):
    GRAMMAR = "grammar"
    STYLE = "style"
    TONE = "tone"
    CLARITY = "clarity"
    FORMALITY = "formality"


class ExportFormat(str, Enum):
    MP4 = "mp4"
    PPTX = "pptx"
    AUDIO_MP3 = "mp3"
    AUDIO_WAV = "wav"


# Request/Response Models
class TextRefinementRequest(BaseModel):
    text: str = Field(..., max_length=10000, description="Text to refine")
    refinement_type: TextRefinementType = Field(default=TextRefinementType.GRAMMAR)
    target_audience: Optional[str] = Field(None, description="Target audience for the content")
    tone: Optional[str] = Field(None, description="Desired tone (professional, casual, academic, etc.)")
    language: str = Field(default="en", description="Language code")


class TextRefinementResponse(BaseModel):
    original_text: str
    refined_text: str
    suggestions: List[Dict[str, Any]]
    confidence_score: float = Field(..., ge=0.0, le=1.0)
    processing_time: float


class TTSRequest(BaseModel):
    text: str = Field(..., max_length=10000, description="Text to convert to speech")
    voice: str = Field(default="en-US-AriaNeural", description="Voice to use")
    speed: float = Field(default=1.0, ge=0.5, le=2.0, description="Speech speed")
    pitch: float = Field(default=0, ge=-50, le=50, description="Pitch adjustment")
    volume: float = Field(default=1.0, ge=0.1, le=2.0, description="Volume level")
    output_format: str = Field(default="mp3", description="Output audio format")
    language: str = Field(default="en-US", description="Language code")


class TTSResponse(BaseModel):
    audio_url: str
    duration: float
    file_size: int
    voice_used: str
    processing_time: float


class SubtitleRequest(BaseModel):
    text: str = Field(..., description="Text for subtitle generation")
    audio_url: Optional[str] = Field(None, description="Audio file URL for synchronization")
    language: str = Field(default="en", description="Language code")
    max_chars_per_line: int = Field(default=50, ge=20, le=100)
    max_lines_per_subtitle: int = Field(default=2, ge=1, le=3)


class SubtitleEntry(BaseModel):
    start_time: float = Field(..., description="Start time in seconds")
    end_time: float = Field(..., description="End time in seconds")
    text: str = Field(..., description="Subtitle text")
    index: int = Field(..., description="Subtitle index")


class SubtitleResponse(BaseModel):
    subtitles: List[SubtitleEntry]
    total_duration: float
    format: str = Field(default="srt", description="Subtitle format")
    processing_time: float


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
    created_at: datetime
    expires_at: datetime


# Database Models
class User(BaseModel):
    id: str
    email: str
    name: str
    preferences: Dict[str, Any] = {}
    created_at: datetime
    updated_at: Optional[datetime] = None


class Presentation(BaseModel):
    id: str
    user_id: str
    title: str
    slides: List[SlideContent]
    settings: Dict[str, Any] = {}
    created_at: datetime
    updated_at: Optional[datetime] = None


class AudioFile(BaseModel):
    id: str
    presentation_id: str
    slide_id: str
    file_path: str
    duration: float
    voice: str
    settings: Dict[str, Any] = {}
    created_at: datetime


class APIResponse(BaseModel):
    """Generic API response wrapper"""
    success: bool = True
    message: str = "Success"
    data: Optional[Any] = None
    error: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.now)


class ErrorResponse(BaseModel):
    """Error response model"""
    success: bool = False
    message: str
    error: str
    timestamp: datetime = Field(default_factory=datetime.now)
    details: Optional[Dict[str, Any]] = None
