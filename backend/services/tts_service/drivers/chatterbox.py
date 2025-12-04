"""Chatterbox TTS driver that delegates to an external Chatterbox FastAPI service."""

import asyncio
import os
import subprocess
import time
import uuid
from pathlib import Path
from typing import Any, ClassVar

import requests

from shared.utils import setup_logging

from .base import TTSEngine

logger = setup_logging("chatterbox-driver")


class ChatterboxTTSEngine(TTSEngine):
    """HTTP-based Chatterbox TTS driver.

    This driver calls an external Chatterbox FastAPI instance (OpenAI-style API).
    It no longer loads the Chatterbox model in-process, keeping the backend
    lightweight. Voice cloning relies on the Chatterbox API configuration
    (e.g., VOICE_SAMPLE_PATH or a voice library configured in that service).
    """

    SUPPORTED_LANGUAGES: ClassVar[list[str]] = [
        "ar", "da", "de", "el", "en", "es", "fi", "fr", "he", "hi",
        "it", "ja", "ko", "ms", "nl", "no", "pl", "pt", "ru", "sv",
        "sw", "tr", "zh"
    ]
    SUPPORTED_FORMATS: ClassVar[list[str]] = ["wav", "mp3"]

    def __init__(self):
        """Initialize HTTP client configuration."""
        self.api_base = os.getenv("CHATTERBOX_API_BASE", "http://chatterbox-tts:4123")
        self.timeout = float(os.getenv("CHATTERBOX_API_TIMEOUT", "120"))
        self.default_exaggeration = float(os.getenv("CHATTERBOX_EXAGGERATION", "0.5"))
        self.default_cfg_weight = float(os.getenv("CHATTERBOX_CFG_WEIGHT", "0.5"))
        self.default_temperature = float(os.getenv("CHATTERBOX_TEMPERATURE", "0.8"))

    async def synthesize(
        self,
        text: str,
        voice: str = "en-US-Default",
        speed: float = 1.0,
        pitch: float = 0,
        output_format: str = "wav",
        language: str = "en",
        audio_prompt_path: str | None = None,
        **kwargs: Any,
    ) -> dict[str, Any]:
        """Synthesize speech by delegating to the external Chatterbox API."""
        logger.info("=" * 80)
        logger.info("CHATTERBOX DRIVER - SYNTHESIZE CALLED")
        logger.info(f"Text length: {len(text)}, preview: {text[:100]}...")
        logger.info(f"Voice: {voice}")
        logger.info(f"Language: {language}")
        logger.info(f"Audio prompt path: {audio_prompt_path}")
        logger.info(f"Speed: {speed}, Pitch: {pitch}, Format: {output_format}")
        logger.info(f"Kwargs received: {kwargs}")

        exaggeration = kwargs.get("exaggeration", self.default_exaggeration)
        temperature = kwargs.get("temperature", self.default_temperature)
        cfg_weight = kwargs.get("cfg_weight", self.default_cfg_weight)
        seed = kwargs.get("seed", 0)

        logger.info(
            "Chatterbox params - exaggeration: %s, temperature: %s, cfg_weight: %s, seed: %s",
            exaggeration,
            temperature,
            cfg_weight,
            seed,
        )

        return await asyncio.to_thread(
            self._synthesize_sync,
            text,
            voice,
            audio_prompt_path,
            language,
            output_format,
            exaggeration,
            temperature,
            cfg_weight,
            seed,
        )

    def _synthesize_sync(
        self,
        text: str,
        voice: str,
        audio_prompt_path: str | None,
        language: str,
        output_format: str,
        exaggeration: float,
        temperature: float,
        cfg_weight: float,
        seed: int
    ) -> dict[str, Any]:
        """Synchronous synthesis (runs in thread pool)."""
        start_time = time.time()

        logger.info("[CHATTERBOX_DRIVER] ===== _synthesize_sync CALLED =====")
        logger.info("[CHATTERBOX_DRIVER]   text=%s... (len=%s)", text[:60], len(text))
        logger.info("[CHATTERBOX_DRIVER]   audio_prompt_path=%s", audio_prompt_path)
        logger.info("[CHATTERBOX_DRIVER]   language=%s", language)
        logger.info("[CHATTERBOX_DRIVER]   output_format=%s", output_format)
        logger.info("[CHATTERBOX_DRIVER]   exaggeration=%s", exaggeration)
        logger.info("[CHATTERBOX_DRIVER]   temperature=%s", temperature)
        logger.info("[CHATTERBOX_DRIVER]   cfg_weight=%s", cfg_weight)
        logger.info("[CHATTERBOX_DRIVER]   seed=%s", seed)

        lang_id = language.split("-")[0] if "-" in language else language
        logger.info("[CHATTERBOX_DRIVER] Language mapping: %s -> %s", language, lang_id)

        if lang_id not in self.SUPPORTED_LANGUAGES:
            raise ValueError(
                f"Unsupported language: {language}. "
                f"Supported: {', '.join(self.SUPPORTED_LANGUAGES)}"
            )

        # Prepare request payload for Chatterbox FastAPI
        max_chars = int(os.getenv("CHATTERBOX_MAX_CHARS", "3000"))
        clipped_text = text[:max_chars]
        if len(text) > max_chars:
            logger.warning(
                "[CHATTERBOX_DRIVER] Text clipped from %s to %s chars before sending to Chatterbox API",
                len(text),
                max_chars,
            )

        payload: dict[str, Any] = {
            "input": clipped_text,
            "voice": voice,
            "response_format": "wav",
            "exaggeration": float(exaggeration) if exaggeration is not None else self.default_exaggeration,
            "cfg_weight": float(cfg_weight) if cfg_weight is not None else self.default_cfg_weight,
            "temperature": float(temperature) if temperature is not None else self.default_temperature,
        }

        # Optional hints
        payload["language"] = lang_id
        if seed:
            payload["seed"] = seed
        if audio_prompt_path:
            # If you extend the Chatterbox API to support per-request prompt paths, include it.
            payload["voice_sample_path"] = audio_prompt_path

        logger.info(
            "[CHATTERBOX_DRIVER] Calling Chatterbox API %s/v1/audio/speech", self.api_base
        )
        url = f"{self.api_base.rstrip('/')}/v1/audio/speech"
        response = requests.post(url, json=payload, timeout=self.timeout)
        if response.status_code != 200:
            logger.error(
                "[CHATTERBOX_DRIVER] API error %s: %s",
                response.status_code,
                response.text[:300],
            )
            response.raise_for_status()

        # Save to MEDIA_ROOT
        output_dir = os.environ.get("MEDIA_ROOT", "/app/media")
        os.makedirs(output_dir, exist_ok=True)

        filename = f"tts_{uuid.uuid4().hex}.{output_format}"
        file_path = os.path.join(output_dir, filename)

        # The API returns WAV bytes. Write and optionally transcode to mp3.
        wav_path = file_path if output_format == "wav" else file_path + ".wav"
        with open(wav_path, "wb") as f:
            f.write(response.content)

        if output_format == "mp3":
            try:
                subprocess.run(
                    ["ffmpeg", "-y", "-i", wav_path, "-codec:a", "libmp3lame", file_path],
                    check=True,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
                Path(wav_path).unlink(missing_ok=True)
            except Exception as exc:
                logger.warning(
                    "[CHATTERBOX_DRIVER] Failed to transcode to mp3, keeping wav. Error: %s",
                    exc,
                )
                file_path = wav_path
                output_format = "wav"

        duration = None
        try:
            probe = subprocess.run(
                [
                    "ffprobe",
                    "-v",
                    "error",
                    "-show_entries",
                    "format=duration",
                    "-of",
                    "default=noprint_wrappers=1:nokey=1",
                    file_path,
                ],
                capture_output=True,
                text=True,
                check=True,
            )
            duration = float(probe.stdout.strip())
        except Exception:
            logger.debug("[CHATTERBOX_DRIVER] Unable to read duration via ffprobe")

        processing_time = time.time() - start_time

        return {
            "audio_url": f"/media/{filename}",
            "file_path": file_path,
            "voice_used": audio_prompt_path or voice or "default",
            "output_format": output_format,
            "language": language,
            "duration": duration,
            "processing_time": processing_time,
            "file_size": Path(file_path).stat().st_size,
        }
