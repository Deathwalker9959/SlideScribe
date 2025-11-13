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
    driver: str | None = Field(default=None, description="Preferred TTS driver identifier")


class TTSResponse(BaseModel):
    audio_url: str
    duration: float
    file_size: int
    voice_used: str
    processing_time: float
    file_path: str | None = None


class SSMLTTSRequest(BaseModel):
    """Request for SSML-based TTS synthesis."""
    ssml: str = Field(..., max_length=15000, description="SSML markup to convert to speech")
    output_format: str = Field(default="mp3", description="Output audio format")
    driver: str | None = Field(default=None, description="Preferred TTS driver identifier")
    voice: str | None = Field(default=None, description="Voice override (if not in SSML)")


class EnhancedTTSRequest(TTSRequest):
    """Enhanced TTS request with SSML Builder integration."""
    use_ssml_builder: bool = Field(default=False, description="Use SSML Builder for enhanced synthesis")
    ssml_preset: str | None = Field(default=None, description="SSML preset name (news_anchor, storytelling, technical, casual)")
    emphasis_words: list[str] = Field(default_factory=list, description="Words to emphasize")
    pauses: dict[int, float] = Field(default_factory=dict, description="Character positions and pause durations")
    lexicon_owner: str | None = Field(default=None, description="Pronunciation lexicon owner")
    lexicon_scope: str = Field(default="presentation", description="Pronunciation lexicon scope")


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
    chart_insights: list[str] = Field(default_factory=list)
    table_insights: list[str] = Field(default_factory=list)
    data_points: list[str] = Field(default_factory=list)
    callouts: list[str] = Field(default_factory=list)
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


class SSMLRequest(BaseModel):
    """Request to generate SSML markup from text."""

    text: str = Field(..., max_length=10000, description="Text to convert to SSML")
    emphasis_words: list[str] = Field(default_factory=list, description="Words to emphasize")
    pauses: dict[int, float] = Field(
        default_factory=dict, description="Character positions and pause durations (in seconds)"
    )
    prosody_rate: float | None = Field(None, ge=0.5, le=2.0, description="Speech rate multiplier")
    prosody_pitch: str | None = Field(None, description="Pitch adjustment (e.g., '+10%', '-5%')")
    prosody_volume: str | None = Field(None, description="Volume adjustment (e.g., 'loud', 'soft')")
    say_as_hints: dict[str, str] = Field(
        default_factory=dict, description="Text fragments and their say-as types (e.g., 'cardinal', 'date')"
    )
    pronunciation_lexicon_id: str | None = Field(
        None, description="ID of pronunciation lexicon to apply"
    )


class SSMLResponse(BaseModel):
    """Response containing generated SSML markup."""

    ssml: str = Field(..., description="Generated SSML markup")
    plain_text: str = Field(..., description="Original text without markup")
    lexicon_applied: bool = Field(default=False, description="Whether a pronunciation lexicon was applied")


class PronunciationEntry(BaseModel):
    """Single pronunciation lexicon entry."""

    grapheme: str = Field(..., max_length=100, description="Text to replace (how it's written)")
    phoneme: str | None = Field(None, description="IPA phonetic spelling")
    alias: str | None = Field(None, description="Replacement text")


class PronunciationLexicon(BaseModel):
    """Pronunciation lexicon for a presentation."""

    lexicon_id: str = Field(..., description="Unique lexicon identifier")
    presentation_id: str | None = Field(None, description="Associated presentation ID (or null for global)")
    owner_id: str | None = Field(None, description="Owner/user ID")
    name: str = Field(..., max_length=100, description="Display name for lexicon")
    entries: list[PronunciationEntry] = Field(default_factory=list, description="Pronunciation entries")
    language: str = Field(default="en-US", description="Language code")
    created_at: datetime | None = None
    updated_at: datetime | None = None


# Analytics and Telemetry Models
class JobMetricsRequest(BaseModel):
    """Request to record job performance metrics."""

    job_id: str = Field(..., description="Unique job identifier")
    presentation_id: str | None = Field(None, description="Associated presentation ID")
    total_slides: int = Field(..., ge=1, description="Number of slides processed")
    total_characters: int = Field(..., ge=0, description="Original text character count")
    refined_characters: int | None = Field(None, ge=0, description="Characters after refinement")
    edit_count: int = Field(default=0, ge=0, description="Number of user edits")
    synthesis_provider: str | None = Field(None, description="TTS provider used")
    synthesis_duration_ms: float | None = Field(None, ge=0, description="TTS processing time")
    synthesis_degraded: bool = Field(default=False, description="Whether degraded mode was used")
    refinement_enabled: bool = Field(default=False, description="Whether AI refinement was used")
    refinement_duration_ms: float | None = Field(None, ge=0, description="Refinement processing time")
    refinement_iterations: int = Field(default=0, ge=0, description="Number of refinement attempts")
    slide_processing_p50: float | None = Field(None, ge=0, description="50th percentile slide processing time")
    slide_processing_p95: float | None = Field(None, ge=0, description="95th percentile slide processing time")
    preview_count: int = Field(default=0, ge=0, description="Number of preview requests")
    voice_changes: int = Field(default=0, ge=0, description="Number of voice setting changes")
    language_changes: int = Field(default=0, ge=0, description="Number of language changes")
    export_formats: list[str] = Field(default_factory=list, description="Export formats used")
    export_count: int = Field(default=0, ge=0, description="Number of exports performed")
    metadata: dict[str, Any] = Field(default_factory=dict, description="Additional metadata")


class JobMetricsResponse(BaseModel):
    """Response containing recorded job metrics."""

    job_id: str
    recorded_at: datetime
    total_duration_ms: float | None = None
    message: str = "Metrics recorded successfully"


class UserFeedbackRequest(BaseModel):
    """Request to record user feedback and SUS scores."""

    job_id: str | None = Field(None, description="Associated job ID")
    # SUS questionnaire responses (1-5 scale)
    sus_q1: int | None = Field(None, ge=1, le=5, description="I think the system is unnecessarily complex")
    sus_q2: int | None = Field(None, ge=1, le=5, description="I think the system is easy to use")
    sus_q3: int | None = Field(None, ge=1, le=5, description="I think I need technical support to use this system")
    sus_q4: int | None = Field(None, ge=1, le=5, description="I think the various functions in this system are well integrated")
    sus_q5: int | None = Field(None, ge=1, le=5, description="I think there is too much inconsistency in this system")
    sus_q6: int | None = Field(None, ge=1, le=5, description="I think most people would learn to use this system very quickly")
    sus_q7: int | None = Field(None, ge=1, le=5, description="I think the system is very cumbersome to use")
    sus_q8: int | None = Field(None, ge=1, le=5, description="I felt very confident using the system")
    sus_q9: int | None = Field(None, ge=1, le=5, description="I think I need to learn a lot before I could get going with this system")
    sus_q10: int | None = Field(None, ge=1, le=5, description="I think the system is unnecessarily complex")
    feedback_text: str | None = Field(None, max_length=1000, description="Additional user feedback")
    rating: int | None = Field(None, ge=1, le=5, description="Overall rating (1-5 stars)")
    issues: list[str] = Field(default_factory=list, description="List of reported issues")
    suggestions: list[str] = Field(default_factory=list, description="List of suggestions")
    context: dict[str, Any] = Field(default_factory=dict, description="Additional context")


class UserFeedbackResponse(BaseModel):
    """Response containing recorded feedback and calculated SUS score."""

    feedback_id: int
    sus_score: float | None = None
    recorded_at: datetime
    message: str = "Feedback recorded successfully"


class TelemetryExportRequest(BaseModel):
    """Request to export telemetry data for analysis."""

    format: str = Field(default="json", pattern="^(json|csv)$", description="Export format")
    start_date: datetime | None = Field(None, description="Filter start date")
    end_date: datetime | None = Field(None, description="Filter end date")
    include_user_feedback: bool = Field(default=False, description="Include user feedback data")
    include_api_usage: bool = Field(default=False, description="Include API usage data")
    job_ids: list[str] = Field(default_factory=list, description="Specific job IDs to include")


class TelemetryExportResponse(BaseModel):
    """Response containing exported telemetry data."""

    export_url: str
    file_size: int
    record_count: int
    export_format: str
    created_at: datetime
    expires_at: datetime


class PronunciationLexiconRequest(BaseModel):
    """Request to create/update pronunciation lexicon."""

    presentation_id: str | None = None
    owner_id: str | None = None
    name: str = Field(..., max_length=100)
    entries: list[PronunciationEntry]
    language: str = Field(default="en-US")


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
    start_offset: float | None = None


class AudioTimelineEntry(BaseModel):
    slide_id: str
    start: float
    end: float
    duration: float
    source_path: str
    volume: float | None = None
    background_track_path: str | None = None


class AudioCombineRequest(BaseModel):
    job_id: str
    presentation_id: str
    segments: list[AudioSegment]
    output_format: str = Field(default="wav", pattern="^(wav|mp3)$")
    background_track_path: str | None = None
    background_volume: float = Field(default=-18.0, ge=-60.0, le=0.0)
    ducking_db: float = Field(default=-6.0, ge=-24.0, le=0.0)
    normalize: bool = True
    target_loudness: float = Field(default=-3.0, le=0.0)
    crossfade_duration_ms: int = Field(default=400, ge=0, le=8000)
    padding_between_segments: float = Field(default=0.2, ge=0.0, le=5.0)


class AudioCombineResponse(BaseModel):
    job_id: str
    output_path: str
    total_duration: float
    segment_count: int
    created_at: datetime
    timeline: list[AudioTimelineEntry] = Field(default_factory=list)
    peak_dbfs: float | None = None
    loudness_dbfs: float | None = None
    background_track_path: str | None = None


class AudioTransition(BaseModel):
    from_slide: str
    to_slide: str
    type: str = Field(default="crossfade")
    duration: float = Field(default=1.0, ge=0.0, le=10.0)


class AudioTransitionRequest(BaseModel):
    job_id: str
    combined_audio_path: str
    transitions: list[AudioTransition]
    output_format: str | None = None
    normalize: bool = False
    target_loudness: float = Field(default=-3.0, le=0.0)


class AudioTransitionResponse(BaseModel):
    job_id: str
    output_path: str
    transitions_applied: int
    created_at: datetime
    updated_at: datetime | None = None
    output_peak_dbfs: float | None = None
    output_loudness_dbfs: float | None = None


class AudioExportRequest(BaseModel):
    job_id: str
    format: str = Field(default="wav", pattern="^(wav|mp3|mp4|pptx|zip)$")
    include_transitions: bool = True


class AudioExportResponse(BaseModel):
    job_id: str
    export_path: str
    format: str
    file_size: int
    created_at: datetime
    download_url: str | None = None


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
