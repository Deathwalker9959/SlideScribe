"""
TTS Fallback Manager

Handles provider fallback chains and degraded mode operation for TTS services.
Provides automatic fallback when primary TTS providers fail or reach limits.
"""

import asyncio
import time
from typing import Any, Dict, List, Optional

from shared.utils import setup_logging

logger = setup_logging("tts-fallback")


class TTSFallbackManager:
    """Manages TTS provider fallback chains and degraded mode operation."""

    def __init__(self, drivers: Dict[str, Any], default_driver: str = "azure"):
        self.drivers = drivers
        self.default_driver = default_driver
        self.fallback_chain = self._build_fallback_chain()
        self.disabled_drivers = set()  # Drivers temporarily disabled due to failures
        self.last_failure_time = {}  # Track when drivers failed for backoff

    def _build_fallback_chain(self) -> List[str]:
        """Build prioritized fallback chain for TTS providers."""
        # Priority: Azure (best SSML support) -> OpenAI (fallback text synthesis)
        available_drivers = list(self.drivers.keys())

        # Azure should be preferred for SSML support
        if "azure" in available_drivers:
            chain = ["azure"]
            other_drivers = [d for d in available_drivers if d != "azure"]
            chain.extend(other_drivers)
        else:
            chain = available_drivers

        logger.info(f"TTS fallback chain: {chain}")
        return chain

    async def synthesize_with_fallback(
        self,
        text: str,
        voice: str = "en-US-AriaNeural",
        speed: float = 1.0,
        pitch: float = 0,
        output_format: str = "mp3",
        language: Optional[str] = None,
        preferred_driver: Optional[str] = None,
        **kwargs: Any,
    ) -> Dict[str, Any]:
        """
        Synthesize speech with automatic provider fallback.

        Args:
            text: Text to synthesize
            voice: Voice to use
            speed: Speech speed
            pitch: Pitch adjustment
            output_format: Output format
            language: Language code
            preferred_driver: Preferred TTS driver (if None, uses default)
            **kwargs: Additional parameters

        Returns:
            Dictionary with synthesis results and provider information
        """
        driver_to_try = preferred_driver or self.default_driver

        # Try preferred driver first
        if driver_to_try in self.drivers and driver_to_try not in self.disabled_drivers:
            try:
                result = await self._synthesize_with_driver(
                    driver_to_try, text, voice, speed, pitch, output_format, language, **kwargs
                )
                result["provider_used"] = driver_to_try
                result["fallback_used"] = False
                logger.info(f"Successfully synthesized using {driver_to_try} driver")
                return result
            except Exception as e:
                logger.warning(f"Preferred driver {driver_to_try} failed: {e}")
                self._mark_driver_failed(driver_to_try)

        # Try fallback chain
        for driver_name in self.fallback_chain:
            if driver_name in self.disabled_drivers or driver_name == driver_to_try:
                continue

            try:
                logger.info(f"Attempting fallback driver: {driver_name}")
                result = await self._synthesize_with_driver(
                    driver_name, text, voice, speed, pitch, output_format, language, **kwargs
                )
                result["provider_used"] = driver_name
                result["fallback_used"] = True
                result["original_preferred"] = driver_to_try

                logger.info(f"Successfully synthesized using fallback driver {driver_name}")
                return result

            except Exception as e:
                logger.warning(f"Fallback driver {driver_name} failed: {e}")
                self._mark_driver_failed(driver_name)
                continue

        # All drivers failed - raise comprehensive error
        raise Exception(
            f"All TTS providers failed. "
            f"Attempted: {[driver_to_try] + [d for d in self.fallback_chain if d not in self.disabled_drivers]}. "
            f"Disabled drivers: {list(self.disabled_drivers)}"
        )

    async def synthesize_ssml_with_fallback(
        self,
        ssml: str,
        output_format: str = "mp3",
        preferred_driver: Optional[str] = None,
        **kwargs: Any,
    ) -> Dict[str, Any]:
        """
        Synthesize speech from SSML with automatic provider fallback.

        Only Azure TTS supports full SSML. Other providers will extract text.
        """
        driver_to_try = preferred_driver or self.default_driver

        # Try preferred driver first
        if driver_to_try in self.drivers and driver_to_try not in self.disabled_drivers:
            try:
                result = await self._synthesize_ssml_with_driver(
                    driver_to_try, ssml, output_format, **kwargs
                )
                result["provider_used"] = driver_to_try
                result["fallback_used"] = False
                result["ssml_supported"] = driver_to_try == "azure"
                logger.info(f"Successfully synthesized SSML using {driver_to_try} driver")
                return result
            except Exception as e:
                logger.warning(f"Preferred driver {driver_to_try} failed for SSML: {e}")
                self._mark_driver_failed(driver_to_try)

        # Try fallback chain for SSML
        for driver_name in self.fallback_chain:
            if driver_name in self.disabled_drivers or driver_name == driver_to_try:
                continue

            try:
                logger.info(f"Attempting fallback driver for SSML: {driver_name}")
                result = await self._synthesize_ssml_with_driver(
                    driver_name, ssml, output_format, **kwargs
                )
                result["provider_used"] = driver_name
                result["fallback_used"] = True
                result["original_preferred"] = driver_to_try
                result["ssml_supported"] = driver_name == "azure"

                logger.info(f"Successfully synthesized SSML using fallback driver {driver_name}")
                return result

            except Exception as e:
                logger.warning(f"Fallback driver {driver_name} failed for SSML: {e}")
                self._mark_driver_failed(driver_name)
                continue

        raise Exception(
            f"All TTS providers failed for SSML synthesis. "
            f"Attempted: {[driver_to_try] + [d for d in self.fallback_chain if d not in self.disabled_drivers]}. "
            f"Disabled drivers: {list(self.disabled_drivers)}"
        )

    async def _synthesize_with_driver(
        self,
        driver_name: str,
        text: str,
        voice: str,
        speed: float,
        pitch: float,
        output_format: str,
        language: Optional[str],
        **kwargs: Any,
    ) -> Dict[str, Any]:
        """Synthesize with a specific driver and add timing."""
        start_time = time.time()

        try:
            driver = self.drivers[driver_name]

            # Convert speed to exaggeration for Chatterbox driver if not already specified
            if driver_name == "chatterbox" and "exaggeration" not in kwargs:
                # Chatterbox uses exaggeration (0.25-2.0) not speed
                # Mapping: speed=0.6 -> exaggeration=0.3 (0.5 * speed_value)
                exaggeration_value = 0.5 * speed
                kwargs["exaggeration"] = exaggeration_value
                logger.info(
                    f"[FALLBACK_MGR] Converted speed={speed} to exaggeration="
                    f"{exaggeration_value} for Chatterbox driver"
                )

            result = await driver.synthesize(
                text=text,
                voice=voice,
                speed=speed,
                pitch=pitch,
                output_format=output_format,
                language=language,
                **kwargs
            )

            # Add processing time and metadata
            processing_time = time.time() - start_time
            result["processing_time"] = processing_time
            result["driver_name"] = driver_name

            # Clear failure status on success
            if driver_name in self.disabled_drivers:
                self.disabled_drivers.remove(driver_name)
                logger.info(f"Re-enabled driver {driver_name} after successful synthesis")

            return result

        except Exception as e:
            # Mark driver as failed with backoff
            self._mark_driver_failed(driver_name)
            raise e

    async def _synthesize_ssml_with_driver(
        self,
        driver_name: str,
        ssml: str,
        output_format: str,
        **kwargs: Any,
    ) -> Dict[str, Any]:
        """Synthesize SSML with a specific driver."""
        start_time = time.time()

        try:
            driver = self.drivers[driver_name]

            # Check if driver supports SSML synthesis
            if hasattr(driver, 'synthesize_ssml'):
                result = await driver.synthesize_ssml(
                    ssml=ssml,
                    output_format=output_format,
                    **kwargs
                )
            else:
                # Fallback: extract text and use regular synthesis
                import re
                text_content = re.sub(r'<[^>]+>', '', ssml).strip()
                if not text_content:
                    raise ValueError(f"No text content found in SSML for driver {driver_name}")

                result = await driver.synthesize(
                    text=text_content,
                    voice="en-US-AriaNeural",  # Default voice for SSML fallback
                    speed=1.0,
                    pitch=0,
                    output_format=output_format,
                    **kwargs
                )
                result["ssml_fallback_used"] = True

            # Add processing time and metadata
            processing_time = time.time() - start_time
            result["processing_time"] = processing_time
            result["driver_name"] = driver_name

            # Clear failure status on success
            if driver_name in self.disabled_drivers:
                self.disabled_drivers.remove(driver_name)
                logger.info(f"Re-enabled driver {driver_name} after successful SSML synthesis")

            return result

        except Exception as e:
            self._mark_driver_failed(driver_name)
            raise e

    def _mark_driver_failed(self, driver_name: str) -> None:
        """Mark a driver as failed with backoff logic."""
        now = time.time()
        self.last_failure_time[driver_name] = now

        # Add to disabled list with backoff
        if driver_name not in self.disabled_drivers:
            self.disabled_drivers.add(driver_name)
            logger.warning(f"Temporarily disabled TTS driver {driver_name} due to failure")

    def is_driver_available(self, driver_name: str) -> bool:
        """Check if a driver is currently available."""
        return (
            driver_name in self.drivers and
            driver_name not in self.disabled_drivers
        )

    def get_available_drivers(self) -> List[str]:
        """Get list of currently available drivers."""
        return [d for d in self.drivers.keys() if d not in self.disabled_drivers]

    def manually_disable_driver(self, driver_name: str, reason: str = "manual") -> None:
        """Manually disable a driver (for maintenance, etc.)."""
        if driver_name in self.drivers:
            self.disabled_drivers.add(driver_name)
            self.last_failure_time[driver_name] = time.time()
            logger.info(f"Manually disabled TTS driver {driver_name}: {reason}")

    def manually_enable_driver(self, driver_name: str) -> None:
        """Manually re-enable a disabled driver."""
        if driver_name in self.disabled_drivers:
            self.disabled_drivers.remove(driver_name)
            if driver_name in self.last_failure_time:
                del self.last_failure_time[driver_name]
            logger.info(f"Manually re-enabled TTS driver {driver_name}")