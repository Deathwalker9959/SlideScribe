"""
Text-to-Speech (TTS) request and response models.
"""
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from .enums import VoiceGender


class TTSRequest(BaseModel):
    """Request model for text-to-speech operations."""
    text: str = Field(..., max_length=10000, description="Text to convert to speech")
    voice: str = Field(default="en-US-AriaNeural", description="Voice to use")
    speed: float = Field(default=1.0, ge=0.5, le=2.0, description="Speech speed")
    pitch: float = Field(default=0, ge=-50, le=50, description="Pitch adjustment")
    volume: float = Field(default=1.0, ge=0.1, le=2.0, description="Volume level")
    output_format: str = Field(default="mp3", description="Audio output format")
    driver: Optional[str] = Field(None, description="TTS driver to use")
    language: str = Field(default="en-US", description="Language code")


class TTSResponse(BaseModel):
    """Response model for text-to-speech operations."""
    audio_url: str = Field(..., description="URL to generated audio file")
    duration: float = Field(..., description="Audio duration in seconds")
    voice_used: str = Field(..., description="Voice that was used")
    output_format: str = Field(..., description="Audio format used")
    file_size: int = Field(..., description="File size in bytes")
    processing_time: float = Field(..., description="Processing time in seconds")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional metadata")


class VoiceInfo(BaseModel):
    """Information about available TTS voices."""
    voice_id: str = Field(..., description="Unique voice identifier")
    name: str = Field(..., description="Human-readable voice name")
    language: str = Field(..., description="Language code")
    region: str = Field(..., description="Region code")
    gender: VoiceGender = Field(..., description="Voice gender")
    neural: bool = Field(default=True, description="Whether voice uses neural synthesis")
    preview_url: Optional[str] = Field(None, description="URL to voice preview sample")
