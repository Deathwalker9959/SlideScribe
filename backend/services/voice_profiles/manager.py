"""Voice profile manager for creating and applying consistent narration settings."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.db import VoiceProfileDB
from shared.models import TTSRequest, VoiceProfile, VoiceProfileRequest, VoiceType
from shared.utils import Cache, setup_logging, validate_text_length

logger = setup_logging("voice-profile-manager")


class VoiceProfileNotFoundError(Exception):
    """Raised when a requested voice profile cannot be found."""


PREFERRED_SETTING_KEYS = {
    "provider",
    "voice",
    "language",
    "speed",
    "pitch",
    "volume",
    "tone",
}


class VoiceProfileManager:
    """Manage creation, retrieval, and application of voice profiles."""

    CACHE_TTL_SECONDS = 24 * 3600

    def __init__(self, session: AsyncSession):
        self.session = session
        self._cache = Cache()

    def _cache_key(self, profile_id: str) -> str:
        return f"voice_profile:{profile_id}"

    async def create_profile(self, profile_data: VoiceProfileRequest) -> VoiceProfile:
        """Create a new voice profile in PostgreSQL."""
        now = datetime.now(UTC)
        profile_id = str(uuid4())
        scope_owner = profile_data.owner_id or "global"

        # Check for duplicate names
        existing = await self.session.execute(
            select(VoiceProfileDB).where(
                VoiceProfileDB.owner_id == scope_owner,
                VoiceProfileDB.name.ilike(profile_data.name)
            )
        )
        if existing.scalar_one_or_none():
            raise ValueError(f"Voice profile named '{profile_data.name}' already exists for this owner")

        db_profile = VoiceProfileDB(
            id=profile_id,
            owner_id=profile_data.owner_id,
            name=profile_data.name,
            description=profile_data.description,
            voice=profile_data.voice,
            language=profile_data.language,
            style=profile_data.style,
            speed=profile_data.speed,
            pitch=profile_data.pitch,
            volume=profile_data.volume,
            sample_text=profile_data.sample_text,
            tags=profile_data.tags or [],
            voice_type=self._resolve_voice_type(profile_data).value,
            audio_sample_path=getattr(profile_data, "audio_sample_path", None),
            cloning_provider=getattr(profile_data, "cloning_provider", None),
            sample_metadata=getattr(profile_data, "sample_metadata", {}) or {},
            created_at=now,
            updated_at=now,
        )

        self.session.add(db_profile)
        await self.session.commit()

        logger.info("Created voice profile %s (%s)", profile_data.name, profile_id)
        return self._db_to_model(db_profile)

    @staticmethod
    def _resolve_voice_type(profile_data: VoiceProfileRequest) -> VoiceType:
        provided = getattr(profile_data, "voice_type", None)
        if provided:
            try:
                return VoiceType(provided)
            except Exception:
                return VoiceType.PRESET
        if getattr(profile_data, "audio_sample_path", None):
            return VoiceType.CUSTOM_CLONED
        return VoiceType.PRESET

    async def get_profile(self, profile_id: str) -> VoiceProfile:
        """Retrieve a voice profile by profile ID or by voice field value."""
        # Check cache first
        cached = self._cache.get(self._cache_key(profile_id))
        if cached:
            return VoiceProfile.model_validate(cached)

        # Query database: try ID first, then voice field
        result = await self.session.execute(
            select(VoiceProfileDB).where(VoiceProfileDB.id == profile_id)
        )
        db_profile = result.scalar_one_or_none()

        # Try voice field if ID not found
        if not db_profile:
            result = await self.session.execute(
                select(VoiceProfileDB).where(VoiceProfileDB.voice == profile_id)
            )
            db_profile = result.scalar_one_or_none()
            if db_profile:
                logger.debug(f"Profile lookup: voice field '{profile_id}' resolved to profile ID '{db_profile.id}'")

        if not db_profile:
            raise VoiceProfileNotFoundError(f"Voice profile with ID or voice field '{profile_id}' not found")

        profile = self._db_to_model(db_profile)
        self._cache.set(self._cache_key(profile_id), profile.model_dump(), ttl=self.CACHE_TTL_SECONDS)
        return profile

    async def update_profile(self, profile_id: str, updates: dict[str, Any]) -> VoiceProfile:
        """Update an existing voice profile."""
        profile = await self.get_profile(profile_id)

        result = await self.session.execute(
            select(VoiceProfileDB).where(VoiceProfileDB.id == profile_id)
        )
        db_profile = result.scalar_one_or_none()
        if not db_profile:
            raise VoiceProfileNotFoundError(f"Voice profile {profile_id} not found")

        allowed_fields = set(VoiceProfile.model_fields.keys()) - {"id", "created_at"}
        for field in allowed_fields & updates.keys():
            setattr(db_profile, field, updates[field])

        db_profile.updated_at = datetime.now(UTC)
        await self.session.commit()

        logger.info("Updated voice profile %s", profile_id)
        self._cache.delete(self._cache_key(profile_id))
        return self._db_to_model(db_profile)

    async def list_profiles(self) -> list[VoiceProfile]:
        """List all available voice profiles."""
        result = await self.session.execute(select(VoiceProfileDB))
        return [self._db_to_model(db_profile) for db_profile in result.scalars().all()]

    async def apply_profile(self, text: str, profile: VoiceProfile) -> TTSRequest:
        """Create a TTS request using the provided profile settings."""
        safe_text = validate_text_length(text)

        # Update last_used_at
        result = await self.session.execute(
            select(VoiceProfileDB).where(VoiceProfileDB.id == profile.id)
        )
        db_profile = result.scalar_one_or_none()
        if db_profile:
            db_profile.last_used_at = datetime.now(UTC)
            await self.session.commit()

        tts_request = TTSRequest(
            text=safe_text,
            voice=profile.voice,
            speed=profile.speed,
            pitch=profile.pitch,
            volume=profile.volume,
            language=profile.language,
        )

        logger.debug("Generated TTS request using profile %s", profile.id)
        return tts_request

    async def delete_profile(self, profile_id: str) -> bool:
        """Delete a voice profile."""
        result = await self.session.execute(
            select(VoiceProfileDB).where(VoiceProfileDB.id == profile_id)
        )
        db_profile = result.scalar_one_or_none()
        if not db_profile:
            return False

        await self.session.delete(db_profile)
        await self.session.commit()
        self._cache.delete(self._cache_key(profile_id))
        logger.info("Deleted voice profile %s", profile_id)
        return True

    async def get_preferred_settings(
        self, owner_id: str | None, presentation_id: str | None
    ) -> dict[str, Any] | None:
        """Get preferred voice settings for an owner/presentation combination."""
        if not owner_id and not presentation_id:
            return None

        cache_key = f"preferred_settings:{owner_id}:{presentation_id}"
        cached = self._cache.get(cache_key)
        if cached:
            return cached

        # Query for the most recently used profile by this owner
        result = await self.session.execute(
            select(VoiceProfileDB)
            .where(VoiceProfileDB.owner_id == owner_id)
            .order_by(VoiceProfileDB.last_used_at.desc())
            .limit(1)
        )
        db_profile = result.scalar_one_or_none()

        if not db_profile:
            return None

        settings = {
            "voice": db_profile.voice,
            "language": db_profile.language,
            "speed": db_profile.speed,
            "pitch": db_profile.pitch,
            "volume": db_profile.volume,
            "style": db_profile.style,
        }

        self._cache.set(cache_key, settings, ttl=self.CACHE_TTL_SECONDS)
        return settings

    async def set_preferred_settings(
        self,
        owner_id: str | None,
        presentation_id: str | None,
        settings: dict[str, Any],
    ) -> None:
        """Store preferred voice settings for an owner/presentation combination."""
        if not owner_id and not presentation_id:
            return

        cache_key = f"preferred_settings:{owner_id}:{presentation_id}"
        self._cache.set(cache_key, settings, ttl=self.CACHE_TTL_SECONDS)

    @staticmethod
    def _db_to_model(db_profile: VoiceProfileDB) -> VoiceProfile:
        """Convert database model to Pydantic model."""
        return VoiceProfile(
            id=db_profile.id,
            name=db_profile.name,
            description=db_profile.description,
            voice=db_profile.voice,
            language=db_profile.language,
            style=db_profile.style,
            speed=db_profile.speed,
            pitch=db_profile.pitch,
            volume=db_profile.volume,
            sample_text=db_profile.sample_text,
            tags=db_profile.tags or [],
            created_at=db_profile.created_at,
            updated_at=db_profile.updated_at,
            last_used_at=db_profile.last_used_at,
            voice_type=VoiceType(db_profile.voice_type),
            audio_sample_path=db_profile.audio_sample_path,
            cloning_provider=db_profile.cloning_provider,
            sample_metadata=db_profile.sample_metadata or {},
            owner_id=db_profile.owner_id,
        )
