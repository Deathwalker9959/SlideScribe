from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime
from .presentation import SlideContent

class User(BaseModel):
    id: str
    email: str
    name: str
    preferences: Dict[str, Any] = {}
    created_at: datetime
    updated_at: Optional[datetime] = None

class Presentation(BaseModel):
    id: str
    user_id: str
    title: str
    slides: List[SlideContent]
    settings: Dict[str, Any] = {}
    created_at: datetime
    updated_at: Optional[datetime] = None

class AudioFile(BaseModel):
    id: str
    presentation_id: str
    slide_id: str
    file_path: str
    duration: float
    voice: str
    settings: Dict[str, Any] = {}
    created_at: datetime
