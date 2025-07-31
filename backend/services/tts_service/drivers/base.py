from abc import ABC, abstractmethod
from typing import Dict, Any

class TTSEngine(ABC):
    """Abstract base class for TTS engines."""

    @abstractmethod
    async def synthesize(self, text: str, voice: str = "en-US-AriaNeural", speed: float = 1.0, pitch: float = 0, output_format: str = "mp3", **kwargs: Any) -> Dict[str, Any]:
        """Synthesize speech from text. Returns a dict with audio_url, duration, etc."""
        pass
