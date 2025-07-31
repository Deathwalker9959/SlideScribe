"""
Common API response models.
"""
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any


class APIResponse(BaseModel):
    """Standard API response wrapper."""
    success: bool = Field(default=True, description="Whether the operation was successful")
    message: str = Field(default="Operation completed successfully", description="Response message")
    data: Optional[Dict[str, Any]] = Field(None, description="Response data")
    timestamp: Optional[str] = Field(None, description="Response timestamp")


class ErrorResponse(BaseModel):
    """Standard API error response."""
    success: bool = Field(default=False, description="Always false for errors")
    message: str = Field(..., description="Error message")
    error: Optional[str] = Field(None, description="Detailed error information")
    error_code: Optional[str] = Field(None, description="Error code for programmatic handling")
    timestamp: Optional[str] = Field(None, description="Error timestamp")


class HealthResponse(BaseModel):
    """Health check response model."""
    status: str = Field(..., description="Service status")
    message: str = Field(..., description="Health check message")
    version: Optional[str] = Field(None, description="Service version")
    uptime: Optional[float] = Field(None, description="Service uptime in seconds")
    dependencies: Optional[Dict[str, str]] = Field(None, description="Dependency status")
