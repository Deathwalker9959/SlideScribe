from abc import ABC, abstractmethod
from typing import Any


class TTSEngine(ABC):
    """Abstract base class for TTS engines."""

    @abstractmethod
    async def synthesize(
        self,
        text: str,
        voice: str = "en-US-AriaNeural",
        speed: float = 1.0,
        pitch: float = 0,
        output_format: str = "mp3",
        **kwargs: Any,
    ) -> dict[str, Any]:
        """Synthesize speech from text. Returns a dict with audio_url, duration, etc."""
        pass

    async def synthesize_ssml(
        self,
        ssml: str,
        output_format: str = "mp3",
        **kwargs: Any,
    ) -> dict[str, Any]:
        """Synthesize speech from SSML. Default implementation may not be supported by all drivers."""
        raise NotImplementedError("SSML synthesis not supported by this TTS driver")
