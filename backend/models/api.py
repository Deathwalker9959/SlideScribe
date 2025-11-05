from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


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
