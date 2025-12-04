"""Application-level Text-to-Speech service wrapper."""

from __future__ import annotations

import logging
from typing import Any

from services.tts_service.app import DEFAULT_DRIVER, TTS_DRIVERS
from shared.models import TTSRequest, TTSResponse

logger = logging.getLogger(__name__)


class TTSService:
    """Provide a simple interface for synthesizing speech via registered drivers."""

    def __init__(self, default_driver: str | None = None) -> None:
        self.drivers = TTS_DRIVERS
        self.default_driver = default_driver or DEFAULT_DRIVER

    async def synthesize_speech(
        self, request: TTSRequest, driver_name: str | None = None, extra_options: dict[str, Any] | None = None
    ) -> TTSResponse:
        driver_id = driver_name or self.default_driver
        driver = self.drivers.get(driver_id)
        if not driver:
            raise ValueError(f"TTS driver '{driver_id}' is not configured")

        logger.info("=" * 80)
        logger.info(f"TTS SERVICE - Calling driver: {driver_id}")
        logger.info(f"Driver type: {type(driver).__name__}")
        logger.info(f"Request - text_len: {len(request.text)}, voice: {request.voice}")
        logger.info(f"Request - language: {request.language}, format: {request.output_format}")
        logger.info(f"Extra options passed to driver: {extra_options}")

        options = extra_options or {}
        result = await driver.synthesize(
            text=request.text,
            voice=request.voice,
            speed=request.speed,
            pitch=request.pitch,
            output_format=request.output_format,
            **options,
        )

        logger.info(f"TTS SERVICE - Driver returned: audio_url={result.get('audio_url')}")
        logger.info("=" * 80)

        return TTSResponse(
            audio_url=result.get("audio_url", ""),
            duration=float(result.get("duration", 0.0)),
            file_size=int(result.get("file_size", 0)),
            voice_used=result.get("voice_used", request.voice),
            processing_time=float(result.get("processing_time", 0.0)),
            file_path=result.get("file_path"),
        )
