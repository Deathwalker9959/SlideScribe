import os
from typing import Any

import aiohttp

from .base import TTSEngine


class AzureTTSEngine(TTSEngine):
    """Azure Cognitive Services TTS implementation."""

    def __init__(self, api_key: str, region: str):
        self.api_key = api_key
        self.region = region
        self.endpoint = f"https://{region}.tts.speech.microsoft.com/cognitiveservices/v1"

    async def synthesize(
        self,
        text: str,
        voice: str = "en-US-AriaNeural",
        speed: float = 1.0,
        pitch: float = 0,
        output_format: str = "mp3",
        language: str | None = None,
        **kwargs: Any,
    ) -> dict[str, Any]:
        import time
        start_time = time.time()

        headers = {
            "Ocp-Apim-Subscription-Key": self.api_key,
            "Content-Type": "application/ssml+xml",
            "X-Microsoft-OutputFormat": self._map_output_format(output_format),
            "User-Agent": "pptx-tts-service",
        }
        locale = language or self._derive_language_from_voice(voice)
        # Convert speed to percentage and pitch to relative value
        rate_percent = f"{speed * 100:g}%"  # 1.0 -> 100%, 1.5 -> 150%
        pitch_value = f"{pitch:+.0f}Hz" if pitch != 0 else "0Hz"  # 0 -> 0Hz, +5 -> +5Hz

        ssml = (
            f"<speak version='1.0' xml:lang='{locale}'>"
            f"<voice xml:lang='{locale}' name='{voice}'>"
            f"<prosody rate='{rate_percent}' pitch='{pitch_value}'>{text}</prosody>"
            f"</voice></speak>"
        )
        async with (
            aiohttp.ClientSession() as session,
            session.post(self.endpoint, data=ssml.encode("utf-8"), headers=headers) as resp,
        ):
            if resp.status != 200:
                raise Exception(f"Azure TTS failed: {resp.status} {await resp.text()}")
            audio_data = await resp.read()
            output_dir = os.environ.get("MEDIA_ROOT", "/app/media")
            os.makedirs(output_dir, exist_ok=True)
            import uuid

            file_extension = "wav" if output_format == "wav" else output_format
            filename = f"tts_{uuid.uuid4().hex}.{file_extension}"
            file_path = os.path.join(output_dir, filename)
            with open(file_path, "wb") as f:
                f.write(audio_data)

            # Estimate duration based on text length and speed (rough estimate)
            words_per_minute = 150 * speed  # Average reading speed adjusted for speech rate
            estimated_words = len(text.split())
            estimated_duration = (estimated_words / words_per_minute) * 60  # Convert to seconds

            processing_time = time.time() - start_time

            return {
                "audio_url": f"/media/{filename}",
                "file_path": file_path,
                "voice_used": voice,
                "output_format": file_extension,
                "language": locale,
                "duration": estimated_duration,
                "processing_time": processing_time,
                "file_size": len(audio_data),
            }

    @staticmethod
    def _map_output_format(output_format: str) -> str:
        if output_format == "wav":
            return "riff-24khz-16bit-mono-pcm"
        if output_format == "ogg":
            return "ogg-48khz-16bit-mono-opus"
        if output_format == "mp3":
            return "audio-16khz-128kbitrate-mono-mp3"
        return "audio-16khz-128kbitrate-mono-mp3"  # Default to higher quality MP3

    async def synthesize_ssml(
        self,
        ssml: str,
        output_format: str = "mp3",
        **kwargs: Any,
    ) -> dict[str, Any]:
        """Synthesize speech from pre-generated SSML."""
        headers = {
            "Ocp-Apim-Subscription-Key": self.api_key,
            "Content-Type": "application/ssml+xml",
            "X-Microsoft-OutputFormat": self._map_output_format(output_format),
            "User-Agent": "pptx-tts-service",
        }
        async with (
            aiohttp.ClientSession() as session,
            session.post(self.endpoint, data=ssml.encode("utf-8"), headers=headers) as resp,
        ):
            if resp.status != 200:
                raise Exception(f"Azure TTS SSML failed: {resp.status} {await resp.text()}")
            audio_data = await resp.read()
            output_dir = os.environ.get("MEDIA_ROOT", "/app/media")
            os.makedirs(output_dir, exist_ok=True)
            import uuid

            file_extension = "wav" if output_format == "wav" else output_format
            filename = f"tts_ssml_{uuid.uuid4().hex}.{file_extension}"
            file_path = os.path.join(output_dir, filename)
            with open(file_path, "wb") as f:
                f.write(audio_data)
            return {
                "audio_url": f"/media/{filename}",
                "file_path": file_path,
                "output_format": file_extension,
                "ssml_used": ssml[:100] + "..." if len(ssml) > 100 else ssml,
            }

    @staticmethod
    def _derive_language_from_voice(voice: str) -> str:
        parts = voice.split("-")
        if len(parts) >= 2:
            return "-".join(parts[:2])
        return "en-US"
