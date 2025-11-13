"""Voice profile manager for creating and applying consistent narration settings."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from shared.models import TTSRequest, VoiceProfile, VoiceProfileRequest
from shared.utils import Cache, ensure_directory, setup_logging, validate_text_length
from shared.utils import config as global_config

logger = setup_logging("voice-profile-manager")


class VoiceProfileNotFoundError(Exception):
    """Raised when a requested voice profile cannot be found."""


STORAGE_VERSION = 2
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

    def __init__(self, storage_path: str | None = None):
        default_path = global_config.get("voice_profile_storage", "./temp/voice_profiles.json")
        self.storage_path = Path(storage_path or default_path)
        ensure_directory(str(self.storage_path.parent))

        self._cache = Cache()
        self._profiles: dict[str, VoiceProfile] = {}
        self._preferred_settings: dict[str, dict[str, Any]] = {}
        self._load_profiles()

    def _cache_key(self, profile_id: str) -> str:
        return f"voice_profile:{profile_id}"

    def _load_profiles(self) -> None:
        """Load voice profiles from storage into memory."""
        if not self.storage_path.exists():
            logger.info("Voice profile storage not found, starting fresh")
            return

        try:
            raw = self.storage_path.read_text(encoding="utf-8")
            data = json.loads(raw)
            if isinstance(data, dict):
                records = data.get("profiles", [])
                preferred_settings = data.get("preferred_settings", {})
            else:
                records = data
                preferred_settings = {}

            for record in records:
                try:
                    profile = VoiceProfile.model_validate(record)
                    self._profiles[profile.id] = profile
                    self._cache.set(self._cache_key(profile.id), profile.model_dump(), ttl=self.CACHE_TTL_SECONDS)
                except Exception as exc:  # pragma: no cover - defensive
                    logger.warning("Skipping invalid voice profile record: %s", exc)

            if isinstance(preferred_settings, dict):
                sanitized_preferences: dict[str, dict[str, Any]] = {}
                for key, value in preferred_settings.items():
                    if not isinstance(key, str) or not isinstance(value, dict):
                        continue
                    sanitized_preferences[key] = {
                        pref_key: pref_value
                        for pref_key, pref_value in value.items()
                        if pref_key in PREFERRED_SETTING_KEYS or pref_key in {"updated_at"}
                    }
                self._preferred_settings = sanitized_preferences
        except Exception as exc:  # pragma: no cover - defensive
            logger.error("Failed to load voice profiles from %s: %s", self.storage_path, exc)

    def _persist_profiles(self) -> None:
        """Persist current profiles to storage."""
        try:
            payload = {
                "version": STORAGE_VERSION,
                "profiles": [profile.model_dump(mode="json") for profile in self._profiles.values()],
                "preferred_settings": self._preferred_settings,
            }
            self.storage_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        except Exception as exc:  # pragma: no cover - defensive
            logger.error("Failed to persist voice profiles: %s", exc)

    @staticmethod
    def _binding_key(owner_id: str | None, presentation_id: str | None) -> str | None:
        if not owner_id and not presentation_id:
            return None
        owner_part = owner_id or "*"
        presentation_part = presentation_id or "*"
        return f"{owner_part}::{presentation_part}"

    @staticmethod
    def _binding_candidates(owner_id: str | None, presentation_id: str | None) -> list[str]:
        """Return preference lookup keys ordered from most specific to least."""
        owner_part = owner_id or None
        presentation_part = presentation_id or None
        candidates: list[str] = []
        if owner_part and presentation_part:
            candidates.append(f"{owner_part}::{presentation_part}")
        if owner_part:
            candidates.append(f"{owner_part}::*")
        if presentation_part:
            candidates.append(f"*::{presentation_part}")
        candidates.append("*::*")
        return candidates

    async def create_profile(self, profile_data: VoiceProfileRequest) -> VoiceProfile:
        """Create a new voice profile and persist it."""
        now = datetime.now(UTC)
        profile_id = str(uuid4())

        # Prevent duplicate names for easier selection
        for existing in self._profiles.values():
            if existing.name.lower() == profile_data.name.lower():
                raise ValueError(f"Voice profile named '{profile_data.name}' already exists")

        profile = VoiceProfile(
            id=profile_id,
            name=profile_data.name,
            description=profile_data.description,
            voice=profile_data.voice,
            language=profile_data.language,
            style=profile_data.style,
            speed=profile_data.speed,
            pitch=profile_data.pitch,
            volume=profile_data.volume,
            sample_text=profile_data.sample_text,
            tags=profile_data.tags,
            created_at=now,
            updated_at=now,
            last_used_at=None,
        )

        self._profiles[profile_id] = profile
        self._cache.set(self._cache_key(profile_id), profile.model_dump(), ttl=self.CACHE_TTL_SECONDS)
        self._persist_profiles()

        logger.info("Created voice profile %s (%s)", profile.name, profile.id)
        return profile

    async def get_profile(self, profile_id: str) -> VoiceProfile:
        """Retrieve a voice profile by id."""
        cached = self._cache.get(self._cache_key(profile_id))
        if cached:
            return VoiceProfile.model_validate(cached)

        profile = self._profiles.get(profile_id)
        if not profile:
            raise VoiceProfileNotFoundError(f"Voice profile '{profile_id}' not found")

        self._cache.set(self._cache_key(profile_id), profile.model_dump(), ttl=self.CACHE_TTL_SECONDS)
        return profile

    async def update_profile(self, profile_id: str, updates: dict[str, Any]) -> VoiceProfile:
        """Update an existing voice profile."""
        profile = await self.get_profile(profile_id)

        # Enforce unique name if provided
        if "name" in updates and updates["name"]:
            for existing_id, existing in self._profiles.items():
                if (
                    existing_id != profile_id
                    and existing.name.lower() == updates["name"].lower()
                ):
                    raise ValueError(f"Voice profile named '{updates['name']}' already exists")

        allowed_fields = set(VoiceProfile.model_fields.keys()) - {"id", "created_at"}
        update_fields = allowed_fields & updates.keys()
        if not update_fields:
            return profile

        updated_data = profile.model_dump()
        for field in update_fields:
            updated_data[field] = updates[field]

        updated_profile = VoiceProfile.model_validate(updated_data)
        updated_profile.updated_at = datetime.now(UTC)

        self._profiles[profile_id] = updated_profile
        self._cache.set(self._cache_key(profile_id), updated_profile.model_dump(), ttl=self.CACHE_TTL_SECONDS)
        self._persist_profiles()

        logger.info("Updated voice profile %s", profile_id)
        return updated_profile

    async def list_profiles(self) -> list[VoiceProfile]:
        """List all available voice profiles."""
        return list(self._profiles.values())

    async def apply_profile(self, text: str, profile: VoiceProfile) -> TTSRequest:
        """Create a TTS request using the provided profile settings."""
        safe_text = validate_text_length(text)

        profile.last_used_at = datetime.now(UTC)
        self._profiles[profile.id] = profile
        self._cache.set(self._cache_key(profile.id), profile.model_dump(), ttl=self.CACHE_TTL_SECONDS)
        self._persist_profiles()

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

    async def get_preferred_settings(
        self,
        owner_id: str | None,
        presentation_id: str | None,
    ) -> dict[str, Any] | None:
        """Return persisted preferred narration settings for the given scope."""
        for candidate in self._binding_candidates(owner_id, presentation_id):
            settings = self._preferred_settings.get(candidate)
            if settings:
                filtered = {key: settings[key] for key in PREFERRED_SETTING_KEYS if key in settings}
                if filtered:
                    return filtered
        return None

    async def set_preferred_settings(
        self,
        owner_id: str | None,
        presentation_id: str | None,
        settings: dict[str, Any],
    ) -> None:
        """Persist preferred narration settings for a scope."""
        binding_key = self._binding_key(owner_id, presentation_id)
        if not binding_key:
            return

        normalised = {
            key: settings[key]
            for key in PREFERRED_SETTING_KEYS
            if key in settings and settings[key] is not None
        }
        if not normalised:
            return

        normalised["updated_at"] = datetime.now(UTC).isoformat()
        self._preferred_settings[binding_key] = normalised
        self._persist_profiles()

    async def clear_preferred_settings(self, owner_id: str | None, presentation_id: str | None) -> None:
        """Remove persisted preferred settings for a scope."""
        binding_key = self._binding_key(owner_id, presentation_id)
        if binding_key and binding_key in self._preferred_settings:
            del self._preferred_settings[binding_key]
            self._persist_profiles()

    async def delete_all(self) -> None:
        """Remove all profiles (primarily for testing)."""
        self._profiles.clear()
        self._cache.clear()
        self._preferred_settings.clear()
        if self.storage_path.exists():
            self.storage_path.unlink()
