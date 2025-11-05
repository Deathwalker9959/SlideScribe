from pydantic import BaseModel, Field


class TTSRequest(BaseModel):
    """Request model for Text-to-Speech conversion."""

    text: str = Field(..., max_length=10000, description="Text to convert to speech")
    voice: str = Field(default="en-US-AriaNeural", description="Voice to use")
    speed: float = Field(default=1.0, ge=0.5, le=2.0, description="Speech speed")
    pitch: float = Field(default=0, ge=-50, le=50, description="Pitch adjustment")
    volume: float = Field(default=1.0, ge=0.1, le=2.0, description="Volume level")
    output_format: str = Field(default="mp3", description="Output audio format")
    language: str = Field(default="en-US", description="Language code")


class TTSResponse(BaseModel):
    """Response model for Text-to-Speech conversion."""

    audio_url: str
    duration: float
    file_size: int
    voice_used: str
    processing_time: float
