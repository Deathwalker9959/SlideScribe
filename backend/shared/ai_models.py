"""
AI Text Refinement request and response models.
"""

from typing import Any

from pydantic import BaseModel, Field

from .enums import AudienceLevel, ContentType, TextRefinementType


class TextRefinementRequest(BaseModel):
    """Request model for text refinement operations."""

    text: str = Field(..., max_length=10000, description="Text to refine")
    refinement_type: TextRefinementType = Field(default=TextRefinementType.GRAMMAR)
    content_type: ContentType | None = Field(None, description="Type of content being refined")
    target_audience: AudienceLevel | None = Field(
        None, description="Target audience for the content"
    )
    tone: str | None = Field(
        None, description="Desired tone (professional, casual, academic, etc.)"
    )
    language: str = Field(default="en", description="Language code")
    custom_instructions: str | None = Field(None, description="Additional refinement instructions")


class TextRefinementSuggestion(BaseModel):
    """Individual suggestion for text improvement."""

    original_span: str = Field(..., description="Original text span")
    suggested_replacement: str = Field(..., description="Suggested replacement")
    reason: str = Field(..., description="Reason for the suggestion")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Confidence in the suggestion")
    start_position: int = Field(..., ge=0, description="Start position in original text")
    end_position: int = Field(..., ge=0, description="End position in original text")


class TextRefinementResponse(BaseModel):
    """Response model for text refinement operations."""

    original_text: str = Field(..., description="Original input text")
    refined_text: str = Field(..., description="Refined output text")
    suggestions: list[TextRefinementSuggestion] = Field(default_factory=list)
    confidence_score: float = Field(..., ge=0.0, le=1.0, description="Overall confidence score")
    processing_time: float = Field(..., description="Processing time in seconds")
    improvement_score: float = Field(..., ge=0.0, le=1.0, description="Improvement score")
    metrics: dict[str, Any] = Field(default_factory=dict, description="Additional metrics")


class BatchRefinementRequest(BaseModel):
    """Request model for batch text refinement operations."""

    requests: list[TextRefinementRequest] = Field(..., description="List of refinement requests")
    pipeline_steps: list[str] | None = Field(None, description="Custom pipeline steps")


class BatchRefinementResponse(BaseModel):
    """Response model for batch text refinement operations."""

    responses: list[TextRefinementResponse] = Field(..., description="List of refinement responses")
    total_processing_time: float = Field(..., description="Total processing time in seconds")
    success_count: int = Field(..., description="Number of successful refinements")
    error_count: int = Field(..., description="Number of failed refinements")
