"""
Common API response models.
"""

from typing import Any

from pydantic import BaseModel, Field


class APIResponse(BaseModel):
    """Standard API response wrapper."""

    success: bool = Field(default=True, description="Whether the operation was successful")
    message: str = Field(default="Operation completed successfully", description="Response message")
    data: dict[str, Any] | None = Field(None, description="Response data")
    timestamp: str | None = Field(None, description="Response timestamp")


class ErrorResponse(BaseModel):
    """Standard API error response."""

    success: bool = Field(default=False, description="Always false for errors")
    message: str = Field(..., description="Error message")
    error: str | None = Field(None, description="Detailed error information")
    error_code: str | None = Field(None, description="Error code for programmatic handling")
    timestamp: str | None = Field(None, description="Error timestamp")


class HealthResponse(BaseModel):
    """Health check response model."""

    status: str = Field(..., description="Service status")
    message: str = Field(..., description="Health check message")
    version: str | None = Field(None, description="Service version")
    uptime: float | None = Field(None, description="Service uptime in seconds")
    dependencies: dict[str, str] | None = Field(None, description="Dependency status")
