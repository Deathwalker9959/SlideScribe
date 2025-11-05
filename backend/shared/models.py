from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


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
    target_audience: str | None = Field(None, description="Target audience for the content")
    tone: str | None = Field(
        None, description="Desired tone (professional, casual, academic, etc.)"
    )
    language: str = Field(default="en", description="Language code")


class TextRefinementResponse(BaseModel):
    original_text: str
    refined_text: str
    suggestions: list[dict[str, Any]]
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
    audio_url: str | None = Field(None, description="Audio file URL for synchronization")
    language: str = Field(default="en", description="Language code")
    max_chars_per_line: int = Field(default=50, ge=20, le=100)
    max_lines_per_subtitle: int = Field(default=2, ge=1, le=3)


class SubtitleEntry(BaseModel):
    start_time: float = Field(..., description="Start time in seconds")
    end_time: float = Field(..., description="End time in seconds")
    text: str = Field(..., description="Subtitle text")
    index: int = Field(..., description="Subtitle index")


class SubtitleResponse(BaseModel):
    subtitles: list[SubtitleEntry]
    total_duration: float
    format: str = Field(default="srt", description="Subtitle format")
    processing_time: float


class SubtitleSyncRequest(BaseModel):
    subtitles: list[SubtitleEntry]
    slide_duration: float
    slide_number: int


class SubtitleConvertRequest(BaseModel):
    subtitles: list[SubtitleEntry]
    target_format: str = Field(default="srt", description="Target subtitle format")


class SubtitleValidationRequest(BaseModel):
    subtitles: list[SubtitleEntry]


class ImageAnalysis(BaseModel):
    caption: str | None = None
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    tags: list[str] = Field(default_factory=list)
    objects: list[str] = Field(default_factory=list)
    text_snippets: list[str] = Field(default_factory=list)
    dominant_colors: list[str] = Field(default_factory=list)
    raw_metadata: dict[str, Any] = Field(default_factory=dict)


class ImageData(BaseModel):
    image_id: str
    description: str | None = None
    alt_text: str | None = None
    labels: list[str] = Field(default_factory=list)
    dominant_colors: list[str] = Field(default_factory=list)
    detected_objects: list[str] = Field(default_factory=list)
    mime_type: str | None = None
    content_base64: str | None = None
    analysis: ImageAnalysis | None = None


class ImageAnalysisRequest(BaseModel):
    presentation_id: str | None = None
    slide_id: str | None = None
    job_id: str | None = None
    images: list[ImageData]
    metadata: dict[str, Any] = Field(default_factory=dict)


class ImageAnalysisResult(BaseModel):
    image_id: str
    analysis: ImageAnalysis


class ImageAnalysisResponse(BaseModel):
    results: list[ImageAnalysisResult]
    processing_time: float


class PresentationContext(BaseModel):
    presentation_title: str | None = None
    section_title: str | None = None
    audience: str | None = None
    current_slide: int | None = None
    total_slides: int | None = None
    previous_slide_summary: str | None = None
    next_slide_summary: str | None = None
    topic_keywords: list[str] = Field(default_factory=list)


class RefinedScript(BaseModel):
    text: str
    highlights: list[str] = Field(default_factory=list)
    image_references: list[str] = Field(default_factory=list)
    transitions: dict[str, str] = Field(default_factory=dict)
    confidence: float = Field(default=0.6, ge=0.0, le=1.0)


class SlideContent(BaseModel):
    slide_id: str
    title: str | None = None
    content: str
    notes: str | None = None
    animations: list[dict[str, Any]] = []
    layout: str | None = None
    images: list[ImageData] = Field(default_factory=list)


class SlideProcessingRequest(BaseModel):
    presentation_id: str
    slide_id: str
    slide_content: str
    slide_number: int
    slide_title: str | None = None
    slide_notes: str | None = None
    slide_layout: str | None = None
    images: list[ImageData] = Field(default_factory=list)
    previous_slide_summary: str | None = None
    next_slide_summary: str | None = None
    total_slides: int | None = None
    audience: str | None = None
    presentation_title: str | None = None
    section_title: str | None = None
    topic_keywords: list[str] = Field(default_factory=list)


class PresentationRequest(BaseModel):
    slides: list[SlideContent]
    settings: dict[str, Any] = {}
    metadata: dict[str, Any] = {}


class ContextualRefinementRequest(BaseModel):
    slide_text: str
    slide_title: str | None = None
    slide_layout: str | None = None
    slide_notes: str | None = None
    images: list[ImageData] = Field(default_factory=list)
    presentation_context: PresentationContext = Field(default_factory=PresentationContext)


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


class VoiceProfileRequest(BaseModel):
    name: str = Field(..., max_length=100, description="Display name for the voice profile")
    description: str | None = Field(
        None, max_length=500, description="Optional description of the voice profile"
    )
    voice: str = Field(
        default="en-US-AriaNeural",
        description="Identifier for the TTS voice (e.g. Azure neural voice id)",
    )
    language: str = Field(default="en-US", description="Language/locale associated with the voice")
    style: str | None = Field(
        None,
        description="Optional speaking style or persona (e.g. 'cheerful', 'narration-professional')",
    )
    speed: float = Field(default=1.0, ge=0.5, le=2.0, description="Speech speed multiplier")
    pitch: float = Field(default=0.0, ge=-50.0, le=50.0, description="Pitch adjustment in semitones")
    volume: float = Field(default=1.0, ge=0.1, le=2.0, description="Volume multiplier")
    sample_text: str | None = Field(
        None, max_length=1000, description="Sample script illustrating the desired tone"
    )
    tags: list[str] = Field(default_factory=list, description="Optional tags for categorization")


class VoiceProfile(BaseModel):
    id: str
    name: str
    description: str | None = None
    voice: str
    language: str
    style: str | None = None
    speed: float = 1.0
    pitch: float = 0.0
    volume: float = 1.0
    sample_text: str | None = None
    tags: list[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime | None = None
    last_used_at: datetime | None = None


# Database Models
class User(BaseModel):
    id: str
    email: str
    name: str
    preferences: dict[str, Any] = {}
    created_at: datetime
    updated_at: datetime | None = None


class Presentation(BaseModel):
    id: str
    user_id: str
    title: str
    slides: list[SlideContent]
    settings: dict[str, Any] = {}
    created_at: datetime
    updated_at: datetime | None = None


class AudioFile(BaseModel):
    id: str
    presentation_id: str
    slide_id: str
    file_path: str
    duration: float
    voice: str
    settings: dict[str, Any] = {}
    created_at: datetime


class AudioSegment(BaseModel):
    slide_id: str
    file_path: str
    duration: float
    volume: float | None = None


class AudioCombineRequest(BaseModel):
    job_id: str
    presentation_id: str
    segments: list[AudioSegment]
    output_format: str = Field(default="wav", pattern="^(wav|mp3)$")


class AudioCombineResponse(BaseModel):
    job_id: str
    output_path: str
    total_duration: float
    segment_count: int
    created_at: datetime


class AudioTransition(BaseModel):
    from_slide: str
    to_slide: str
    type: str = Field(default="crossfade")
    duration: float = Field(default=1.0, ge=0.0, le=10.0)


class AudioTransitionRequest(BaseModel):
    job_id: str
    combined_audio_path: str
    transitions: list[AudioTransition]


class AudioTransitionResponse(BaseModel):
    job_id: str
    output_path: str
    transitions_applied: int
    created_at: datetime


class APIResponse(BaseModel):
    """Generic API response wrapper"""

    success: bool = True
    message: str = "Success"
    data: Any | None = None
    error: str | None = None
    timestamp: datetime = Field(default_factory=datetime.now)


class ErrorResponse(BaseModel):
    """Error response model"""

    success: bool = False
    message: str
    error: str
    timestamp: datetime = Field(default_factory=datetime.now)
    details: dict[str, Any] | None = None
