from typing import Any

from pydantic import BaseModel, Field

from .enums import TextRefinementType


class TextRefinementRequest(BaseModel):
    """Request model for text refinement."""

    text: str = Field(..., max_length=10000, description="Text to refine")
    refinement_type: TextRefinementType = Field(default=TextRefinementType.GRAMMAR)
    target_audience: str | None = Field(None, description="Target audience for the content")
    tone: str | None = Field(
        None, description="Desired tone (professional, casual, academic, etc.)"
    )
    language: str = Field(default="en", description="Language code")


class TextRefinementResponse(BaseModel):
    """Response model for text refinement."""

    original_text: str
    refined_text: str
    suggestions: list[dict[str, Any]]
    confidence_score: float = Field(..., ge=0.0, le=1.0)
    processing_time: float
