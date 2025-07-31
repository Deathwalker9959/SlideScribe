from pydantic import BaseModel, Field
from typing import Optional, Any, Dict
from datetime import datetime

class APIResponse(BaseModel):
    """Generic API response wrapper"""
    success: bool = True
    message: str = "Success"
    data: Optional[Any] = None
    error: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.now)

class ErrorResponse(BaseModel):
    """Error response model"""
    success: bool = False
    message: str
    error: str
    timestamp: datetime = Field(default_factory=datetime.now)
    details: Optional[Dict[str, Any]] = None
