from pydantic import BaseModel, Field


class SubtitleRequest(BaseModel):
    """Request model for subtitle generation."""

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
