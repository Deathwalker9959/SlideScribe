"""Voice profile auto-apply service for consistent narration settings."""

from __future__ import annotations

import logging
from typing import Any

from shared.models import TTSRequest, VoiceProfile
from shared.utils import setup_logging

from .manager import VoiceProfileManager

logger = setup_logging("voice-profile-auto-apply")


class VoiceProfileAutoApply:
    """Service for automatically applying voice profiles based on context."""

    def __init__(self, profile_manager: VoiceProfileManager):
        self.profile_manager = profile_manager

    async def get_or_create_default_profile(self, language: str = "en-US") -> VoiceProfile:
        """Get or create a default voice profile for the given language."""
        try:
            # Try to find an existing default profile for this language
            profiles = await self.profile_manager.list_profiles()
            for profile in profiles:
                if (profile.language == language and 
                    ("default" in profile.name.lower() or language in profile.name.lower())):
                    logger.info(f"Found existing default profile for {language}: {profile.name}")
                    return profile
        except Exception as e:
            logger.warning(f"Error listing profiles: {e}")

        # Create a new default profile
        from shared.models import VoiceProfileRequest
        
        default_voice = self._get_default_voice_for_language(language)
        profile_request = VoiceProfileRequest(
            name=f"Default {language} Voice",
            description=f"Default voice profile for {language} presentations",
            voice=default_voice,
            language=language,
            speed=1.0,
            pitch=0.0,
            volume=1.0,
            sample_text="Welcome to this presentation. We'll explore key concepts and insights together.",
            tags=["default", language, "auto-generated"]
        )

        try:
            profile = await self.profile_manager.create_profile(profile_request)
            logger.info(f"Created new default profile for {language}: {profile.name}")
            return profile
        except Exception as e:
            logger.error(f"Failed to create default profile for {language}: {e}")
            # Fallback to a hardcoded profile
            return VoiceProfile(
                id="fallback-default",
                name=f"Fallback Default {language}",
                description="Fallback voice profile",
                voice=default_voice,
                language=language,
                speed=1.0,
                pitch=0.0,
                volume=1.0,
                sample_text="Welcome to this presentation.",
                tags=["fallback", "default"],
                created_at=None,
                updated_at=None,
                last_used_at=None
            )

    def _get_default_voice_for_language(self, language: str) -> str:
        """Get the default voice for a given language."""
        voice_mapping = {
            "en-US": "en-US-AriaNeural",
            "el-GR": "el-GR-AthinaNeural",
            "en-GB": "en-GB-LibbyNeural",
            "es-ES": "es-ES-ElviraNeural",
            "fr-FR": "fr-FR-DeniseNeural",
            "de-DE": "de-DE-KatjaNeural",
            "it-IT": "it-IT-ElsaNeural",
            "pt-BR": "pt-BR-FranciscaNeural",
            "zh-CN": "zh-CN-XiaoxiaoNeural",
            "ja-JP": "ja-JP-NanamiNeural",
        }
        return voice_mapping.get(language, "en-US-AriaNeural")

    async def apply_profile_for_context(
        self,
        text: str,
        language: str = "en-US",
        owner_id: str | None = None,
        presentation_id: str | None = None,
        fallback_settings: dict[str, Any] | None = None
    ) -> TTSRequest:
        """Apply the most appropriate voice profile for the given context."""
        
        # First, try to get preferred settings for this context
        preferred_settings = await self.profile_manager.get_preferred_settings(
            owner_id=owner_id,
            presentation_id=presentation_id
        )

        if preferred_settings:
            logger.info(f"Using preferred settings for {owner_id}/{presentation_id}")
            return self._create_tts_request_from_settings(text, preferred_settings)

        # Try to find a profile matching the language
        try:
            profiles = await self.profile_manager.list_profiles()
            matching_profile = None

            # Look for exact language match
            for profile in profiles:
                if profile.language == language:
                    matching_profile = profile
                    break

            # If no exact match, try to find a default profile
            if not matching_profile:
                matching_profile = await self.get_or_create_default_profile(language)

            if matching_profile:
                logger.info(f"Using voice profile: {matching_profile.name}")
                return await self.profile_manager.apply_profile(text, matching_profile)

        except Exception as e:
            logger.warning(f"Error applying voice profile: {e}")

        # Fallback to provided settings or defaults
        if fallback_settings:
            logger.info("Using fallback settings")
            return self._create_tts_request_from_settings(text, fallback_settings)

        # Final fallback
        logger.info("Using system defaults")
        return TTSRequest(
            text=text,
            voice=self._get_default_voice_for_language(language),
            speed=1.0,
            pitch=0.0,
            volume=1.0,
            language=language
        )

    def _create_tts_request_from_settings(self, text: str, settings: dict[str, Any]) -> TTSRequest:
        """Create a TTS request from settings dictionary."""
        return TTSRequest(
            text=text,
            voice=settings.get("voice", self._get_default_voice_for_language(settings.get("language", "en-US"))),
            speed=settings.get("speed", 1.0),
            pitch=settings.get("pitch", 0.0),
            volume=settings.get("volume", 1.0),
            language=settings.get("language", "en-US")
        )

    async def save_preferred_settings(
        self,
        owner_id: str | None,
        presentation_id: str | None,
        settings: dict[str, Any]
    ) -> None:
        """Save preferred settings for future auto-application."""
        try:
            await self.profile_manager.set_preferred_settings(
                owner_id=owner_id,
                presentation_id=presentation_id,
                settings=settings
            )
            logger.info(f"Saved preferred settings for {owner_id}/{presentation_id}")
        except Exception as e:
            logger.error(f"Failed to save preferred settings: {e}")

    async def get_recommended_profile(
        self,
        language: str = "en-US",
        tone: str | None = None,
        style: str | None = None
    ) -> VoiceProfile | None:
        """Get a recommended profile based on language and optional tone/style."""
        try:
            profiles = await self.profile_manager.list_profiles()
            
            # Filter by language first
            language_profiles = [p for p in profiles if p.language == language]
            
            if not language_profiles:
                return await self.get_or_create_default_profile(language)

            # If tone is specified, try to find a matching profile
            if tone:
                for profile in language_profiles:
                    if (tone.lower() in profile.name.lower() or 
                        tone.lower() in (profile.description or "").lower() or
                        tone.lower() in profile.tags):
                        return profile

            # If style is specified, try to find a matching profile
            if style:
                for profile in language_profiles:
                    if (style.lower() in profile.name.lower() or 
                        style.lower() in (profile.description or "").lower() or
                        style.lower() in profile.tags):
                        return profile

            # Return the most recently used profile for this language
            return max(language_profiles, key=lambda p: p.last_used_at or p.created_at or "")

        except Exception as e:
            logger.error(f"Error getting recommended profile: {e}")
            return None

    async def create_profile_from_settings(
        self,
        name: str,
        settings: dict[str, Any],
        description: str | None = None,
        tags: list[str] | None = None
    ) -> VoiceProfile:
        """Create a voice profile from settings dictionary."""
        from shared.models import VoiceProfileRequest
        
        profile_request = VoiceProfileRequest(
            name=name,
            description=description or f"Voice profile created from settings",
            voice=settings.get("voice", self._get_default_voice_for_language(settings.get("language", "en-US"))),
            language=settings.get("language", "en-US"),
            speed=settings.get("speed", 1.0),
            pitch=settings.get("pitch", 0.0),
            volume=settings.get("volume", 1.0),
            sample_text=settings.get("sample_text", "Welcome to this presentation."),
            tags=tags or []
        )

        return await self.profile_manager.create_profile(profile_request)