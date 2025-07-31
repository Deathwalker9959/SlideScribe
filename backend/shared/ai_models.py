"""
AI Text Refinement request and response models.
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from .enums import TextRefinementType, ContentType, AudienceLevel


class TextRefinementRequest(BaseModel):
    """Request model for text refinement operations."""
    text: str = Field(..., max_length=10000, description="Text to refine")
    refinement_type: TextRefinementType = Field(default=TextRefinementType.GRAMMAR)
    content_type: Optional[ContentType] = Field(None, description="Type of content being refined")
    target_audience: Optional[AudienceLevel] = Field(None, description="Target audience for the content")
    tone: Optional[str] = Field(None, description="Desired tone (professional, casual, academic, etc.)")
    language: str = Field(default="en", description="Language code")
    custom_instructions: Optional[str] = Field(None, description="Additional refinement instructions")


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
    suggestions: List[TextRefinementSuggestion] = Field(default_factory=list)
    confidence_score: float = Field(..., ge=0.0, le=1.0, description="Overall confidence score")
    processing_time: float = Field(..., description="Processing time in seconds")
    improvement_score: float = Field(..., ge=0.0, le=1.0, description="Improvement score")
    metrics: Dict[str, Any] = Field(default_factory=dict, description="Additional metrics")


class BatchRefinementRequest(BaseModel):
    """Request model for batch text refinement operations."""
    requests: List[TextRefinementRequest] = Field(..., description="List of refinement requests")
    pipeline_steps: Optional[List[str]] = Field(None, description="Custom pipeline steps")


class BatchRefinementResponse(BaseModel):
    """Response model for batch text refinement operations."""
    responses: List[TextRefinementResponse] = Field(..., description="List of refinement responses")
    total_processing_time: float = Field(..., description="Total processing time in seconds")
    success_count: int = Field(..., description="Number of successful refinements")
    error_count: int = Field(..., description="Number of failed refinements")
