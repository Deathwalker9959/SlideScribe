import os
import uuid
from typing import Any, ClassVar

from openai import AsyncOpenAI

from .base import TTSEngine


class OpenAITTSEngine(TTSEngine):
    """OpenAI TTS implementation using their text-to-speech API."""

    SUPPORTED_MODELS: ClassVar[list[str]] = ["tts-1", "tts-1-hd"]
    SUPPORTED_VOICES: ClassVar[list[str]] = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"]
    SUPPORTED_FORMATS: ClassVar[list[str]] = ["mp3", "opus", "aac", "flac"]

    def __init__(self, api_key: str):
        """
        Initialize OpenAI TTS engine.

        Args:
            api_key: OpenAI API key
        """
        self.api_key = api_key
        self.client = AsyncOpenAI(api_key=api_key)

    async def synthesize(
        self,
        text: str,
        voice: str = "alloy",
        speed: float = 1.0,
        pitch: float = 0,
        output_format: str = "mp3",
        **kwargs: Any,
    ) -> dict[str, Any]:
        """
        Synthesize speech from text using OpenAI TTS.

        Args:
            text: Text to convert to speech
            voice: Voice to use (alloy, echo, fable, onyx, nova, shimmer)
            speed: Speech speed (0.25 to 4.0)
            pitch: Not supported by OpenAI TTS (included for interface compatibility)
            output_format: Audio format (mp3, opus, aac, flac)
            **kwargs: Additional options
                - model: TTS model to use ("tts-1" or "tts-1-hd")

        Returns:
            Dictionary with audio file information
        """
        # Validate inputs
        if voice not in self.SUPPORTED_VOICES:
            voice = "alloy"

        if output_format not in self.SUPPORTED_FORMATS:
            output_format = "mp3"

        # Clamp speed to valid range
        speed = max(0.25, min(4.0, speed))

        # Get model from kwargs, default to tts-1
        model = kwargs.get("model", "tts-1")
        if model not in self.SUPPORTED_MODELS:
            model = "tts-1"

        try:
            # Call OpenAI TTS API
            response = await self.client.audio.speech.create(
                model=model,
                voice=voice,
                input=text,
                response_format=output_format,
                speed=speed,
            )

            # Save audio to file
            output_dir = os.environ.get("MEDIA_ROOT", "/app/media")
            os.makedirs(output_dir, exist_ok=True)

            filename = f"tts_{uuid.uuid4().hex}.{output_format}"
            file_path = os.path.join(output_dir, filename)

            # Write audio content to file
            with open(file_path, "wb") as f:
                async for chunk in response.iter_bytes():
                    f.write(chunk)

            return {
                "audio_url": f"/media/{filename}",
                "file_path": file_path,
                "voice_used": voice,
                "output_format": output_format,
                "model": model,
                "speed": speed,
            }

        except Exception as e:
            raise Exception(f"OpenAI TTS synthesis failed: {e!s}") from e

    async def synthesize_ssml(
        self,
        ssml: str,
        output_format: str = "mp3",
        **kwargs: Any,
    ) -> dict[str, Any]:
        """
        Synthesize speech from SSML using OpenAI TTS.

        Note: OpenAI TTS doesn't natively support SSML, so we extract plain text.
        SSML features like emphasis, pauses, and prosody will be ignored.
        """
        import re

        # Extract plain text from SSML (very basic extraction)
        # This is a fallback when SSML features are needed but driver doesn't support them
        text_content = re.sub(r'<[^>]+>', '', ssml)
        text_content = text_content.strip()

        if not text_content:
            raise ValueError("No text content found in SSML")

        # Use regular synthesis with extracted text
        return await self.synthesize(
            text=text_content,
            voice="alloy",  # Default voice for SSML fallback
            speed=1.0,
            output_format=output_format,
            **kwargs
        )
