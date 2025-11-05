"""
Enums and constants used across the application.
"""

from enum import Enum


class VoiceGender(str, Enum):
    """Available voice genders for TTS."""

    MALE = "male"
    FEMALE = "female"
    NEUTRAL = "neutral"


class TextRefinementType(str, Enum):
    """Types of text refinement available."""

    GRAMMAR = "grammar"
    STYLE = "style"
    TONE = "tone"
    CLARITY = "clarity"
    FORMALITY = "formality"


class ExportFormat(str, Enum):
    """Available export formats for presentations."""

    MP4 = "mp4"
    PPTX = "pptx"
    AUDIO_MP3 = "mp3"
    AUDIO_WAV = "wav"


class ContentType(str, Enum):
    """Types of content for refinement."""

    TITLE = "title"
    BULLET_POINTS = "bullet_points"
    BODY_TEXT = "body_text"
    CONCLUSION = "conclusion"


class AudienceLevel(str, Enum):
    """Target audience levels."""

    EXECUTIVE = "executive"
    TECHNICAL = "technical"
    GENERAL = "general"
    ACADEMIC = "academic"
