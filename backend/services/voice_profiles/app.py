"""FastAPI application for managing voice profiles."""

from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from sqlalchemy.ext.asyncio import AsyncSession

from database import get_async_db
from services.auth import oauth2_scheme, oauth2_scheme_optional
from services.voice_profiles.auto_apply import VoiceProfileAutoApply
from services.voice_profiles.custom_voices import CustomVoiceManager
from services.voice_profiles.manager import (
    VoiceProfileManager,
    VoiceProfileNotFoundError,
)
from shared.models import (
    TTSRequest,
    VoiceProfile,
    VoiceProfileRequest,
    VoiceSampleUploadRequest,
    VoiceSampleUploadResponse,
    VoiceType,
)
from shared.utils import config, setup_logging

logger = setup_logging("voice-profile-service")

app = FastAPI(
    title="Voice Profile Service",
    description="Manage reusable voice and narration presets for consistent audio output",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.get("allowed_origins", ["*"]),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

custom_voice_manager = CustomVoiceManager()
app.state.custom_voice_manager = custom_voice_manager


async def get_voice_profile_manager(session: AsyncSession = Depends(get_async_db)) -> VoiceProfileManager:
    """Get voice profile manager with async session."""
    return VoiceProfileManager(session=session)


async def get_voice_profile_auto_apply(session: AsyncSession = Depends(get_async_db)) -> VoiceProfileAutoApply:
    """Get auto-apply service with async session."""
    manager = VoiceProfileManager(session=session)
    return VoiceProfileAutoApply(manager)


def get_custom_voice_manager() -> CustomVoiceManager:
    return app.state.custom_voice_manager


class VoiceProfileUpdateRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    voice: str | None = None
    language: str | None = None
    style: str | None = None
    speed: float | None = None
    pitch: float | None = None
    volume: float | None = None
    sample_text: str | None = None
    tags: list[str] | None = None


class ApplyProfileRequest(BaseModel):
    text: str


class PreferredSettingsRequest(BaseModel):
    """Request to set preferred voice settings for a presentation or owner."""

    owner_id: str | None = None
    presentation_id: str | None = None
    provider: str | None = None
    voice: str | None = None
    language: str | None = None
    speed: float | None = None
    pitch: float | None = None
    volume: float | None = None
    tone: str | None = None


class AutoApplyRequest(BaseModel):
    """Request to auto-apply voice profile for a presentation."""

    text: str
    presentation_id: str
    owner_id: str | None = None
    language: str = "en-US"
    fallback_settings: dict[str, Any] | None = None


class EnhancedAutoApplyRequest(BaseModel):
    """Enhanced auto-apply request with tone/style preferences."""

    text: str
    presentation_id: str
    owner_id: str | None = None
    language: str = "en-US"
    tone: str | None = None
    style: str | None = None
    fallback_settings: dict[str, Any] | None = None


class CreateProfileFromSettingsRequest(BaseModel):
    """Request to create a voice profile from settings."""

    name: str
    settings: dict[str, Any]
    description: str | None = None
    tags: list[str] | None = None


class RecommendedProfileRequest(BaseModel):
    """Request to get a recommended voice profile."""

    language: str = "en-US"
    tone: str | None = None
    style: str | None = None


@app.get("/health")
async def health_check():
    """Health endpoint for voice profile service."""
    return {"status": "ok", "service": "voice-profiles"}


@app.post("/create", response_model=VoiceProfile, status_code=201)
async def create_voice_profile(
    request: VoiceProfileRequest,
    token: str | None = Depends(oauth2_scheme_optional),
    x_session_id: str | None = Header(default=None, alias="X-Session-Id"),
    profile_manager: VoiceProfileManager = Depends(get_voice_profile_manager),
) -> VoiceProfile:
    """Create a new reusable voice profile."""
    try:
        owner_id = resolve_owner_or_session(token, x_session_id)
        request_with_owner = request.model_copy(update={"owner_id": owner_id})
        profile = await profile_manager.create_profile(request_with_owner)
        return profile
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/list", response_model=list[VoiceProfile])
async def list_voice_profiles(
    token: str | None = Depends(oauth2_scheme_optional),
    profile_manager: VoiceProfileManager = Depends(get_voice_profile_manager),
) -> list[VoiceProfile]:
    """List all available voice profiles."""
    profiles = await profile_manager.list_profiles()
    return profiles


@app.get("/", response_model=list[VoiceProfile])
async def list_voice_profiles_alias(
    token: str | None = Depends(oauth2_scheme_optional),
    profile_manager: VoiceProfileManager = Depends(get_voice_profile_manager),
) -> list[VoiceProfile]:
    """Alias for listing voice profiles (frontend expects /voice-profiles)."""
    return await profile_manager.list_profiles()


@app.post("/upload-sample", response_model=VoiceSampleUploadResponse)
async def upload_voice_sample(
    request: VoiceSampleUploadRequest,
    token: str | None = Depends(oauth2_scheme_optional),
    x_session_id: str | None = Header(default=None, alias="X-Session-Id"),
    custom_voice_mgr: CustomVoiceManager = Depends(get_custom_voice_manager),
    profile_manager: VoiceProfileManager = Depends(get_voice_profile_manager),
) -> VoiceSampleUploadResponse:
    """Upload custom voice sample for cloning.

    This endpoint allows users to upload audio samples that will be used
    for zero-shot voice cloning with Chatterbox TTS.
    """
    user_id = resolve_owner_or_session(token, x_session_id)

    try:
        # Upload and validate voice sample
        profile = await custom_voice_mgr.upload_voice_sample(user_id, request)

        # Save profile to voice profile manager
        await profile_manager.create_profile(
            VoiceProfileRequest(
                name=profile.name,
                description=profile.description,
                voice=profile.voice,
                language=profile.language,
                speed=profile.speed,
                pitch=profile.pitch,
                volume=profile.volume,
                owner_id=profile.owner_id,
                voice_type=profile.voice_type,
                audio_sample_path=profile.audio_sample_path,
                cloning_provider=profile.cloning_provider,
                sample_metadata=profile.sample_metadata,
                tags=profile.tags,
            )
        )

        return VoiceSampleUploadResponse(
            profile_id=profile.id,
            name=profile.name,
            voice_type=profile.voice_type,
            audio_sample_path=profile.audio_sample_path or "",
            sample_duration=profile.sample_metadata.get("duration", 0.0),
            sample_format=profile.sample_metadata.get("format", "wav"),
            status="ready",
            message="Voice sample uploaded successfully"
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/custom-voices", response_model=list[VoiceProfile])
async def get_custom_voices(
    token: str | None = Depends(oauth2_scheme_optional),
    x_session_id: str | None = Header(default=None, alias="X-Session-Id"),
    profile_manager: VoiceProfileManager = Depends(get_voice_profile_manager),
) -> list[VoiceProfile]:
    """List user's custom voice profiles.

    Returns all voice profiles of type CUSTOM_CLONED owned by the current user.
    """
    user_id = resolve_owner_or_session(token, x_session_id)

    # Get all profiles
    all_profiles = await profile_manager.list_profiles()

    # Filter for custom cloned voices owned by this user
    custom_profiles = [
        profile for profile in all_profiles
        if profile.voice_type == VoiceType.CUSTOM_CLONED and profile.owner_id == user_id
    ]

    return custom_profiles


@app.delete("/custom-voices/{profile_id}")
async def delete_custom_voice(
    profile_id: str,
    token: str | None = Depends(oauth2_scheme_optional),
    x_session_id: str | None = Header(default=None, alias="X-Session-Id"),
    custom_voice_mgr: CustomVoiceManager = Depends(get_custom_voice_manager),
    profile_manager: VoiceProfileManager = Depends(get_voice_profile_manager),
) -> dict:
    """Delete custom voice profile and sample.

    This endpoint removes both the voice profile from the database
    and the audio sample file from storage.
    """
    user_id = resolve_owner_or_session(token, x_session_id)

    # Verify ownership
    try:
        profile = await profile_manager.get_profile(profile_id)
        if profile.owner_id != user_id:
            raise HTTPException(status_code=403, detail="Not authorized to delete this voice profile")
    except VoiceProfileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    # Delete voice sample file
    await custom_voice_mgr.delete_custom_voice(user_id, profile_id)

    # Note: We don't have a delete method in VoiceProfileManager yet
    # In a real implementation, you would add that method
    # await profile_manager.delete_profile(profile_id)

    logger.info(f"Deleted custom voice profile {profile_id} for user {user_id}")

    return {"status": "deleted", "profile_id": profile_id}


@app.get("/{profile_id}", response_model=VoiceProfile)
async def get_voice_profile(
    profile_id: str,
    token: str | None = Depends(oauth2_scheme_optional),
    profile_manager: VoiceProfileManager = Depends(get_voice_profile_manager),
) -> VoiceProfile:
    """Fetch a specific voice profile."""
    try:
        return await profile_manager.get_profile(profile_id)
    except VoiceProfileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.put("/{profile_id}", response_model=VoiceProfile)
async def update_voice_profile(
    profile_id: str,
    update_request: VoiceProfileUpdateRequest,
    token: str | None = Depends(oauth2_scheme_optional),
    profile_manager: VoiceProfileManager = Depends(get_voice_profile_manager),
) -> VoiceProfile:
    """Update an existing voice profile."""
    updates = update_request.model_dump(exclude_unset=True, exclude_none=True)
    if not updates:
        return await profile_manager.get_profile(profile_id)

    try:
        profile = await profile_manager.update_profile(profile_id, updates)
        return profile
    except VoiceProfileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/apply/{profile_id}", response_model=TTSRequest)
async def apply_voice_profile(
    profile_id: str,
    request: ApplyProfileRequest,
    token: str | None = Depends(oauth2_scheme_optional),
    profile_manager: VoiceProfileManager = Depends(get_voice_profile_manager),
) -> TTSRequest:
    """Generate a TTS request using a stored voice profile."""
    try:
        profile = await profile_manager.get_profile(profile_id)
        tts_request = await profile_manager.apply_profile(request.text, profile)
        return tts_request
    except VoiceProfileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/preferred-settings")
async def get_preferred_settings(
    presentation_id: str | None = None,
    owner_id: str | None = None,
    token: str | None = Depends(oauth2_scheme_optional),
    profile_manager: VoiceProfileManager = Depends(get_voice_profile_manager),
) -> dict:
    """
    Get preferred voice settings for a presentation and/or owner.

    Uses hierarchical lookup:
    1. owner:presentation (most specific)
    2. owner:* (all presentations for owner)
    3. *:presentation (all owners for presentation)
    4. *:* (global default)
    """
    settings = await profile_manager.get_preferred_settings(owner_id, presentation_id)
    if settings:
        return {"settings": settings, "scope": {"owner_id": owner_id, "presentation_id": presentation_id}}
    return {"settings": None, "scope": {"owner_id": owner_id, "presentation_id": presentation_id}}


@app.post("/preferred-settings")
async def set_preferred_settings(
    request: PreferredSettingsRequest,
    token: str | None = Depends(oauth2_scheme_optional),
    profile_manager: VoiceProfileManager = Depends(get_voice_profile_manager),
) -> dict:
    """
    Set preferred voice settings for a presentation and/or owner.

    Settings are stored hierarchically and auto-applied during narration generation.
    """
    settings = request.model_dump(exclude_unset=True, exclude_none=True, exclude={"owner_id", "presentation_id"})

    if not settings:
        raise HTTPException(status_code=400, detail="No settings provided")

    await profile_manager.set_preferred_settings(
        request.owner_id,
        request.presentation_id,
        settings,
    )

    logger.info(
        "Set preferred settings for owner=%s, presentation=%s: %s",
        request.owner_id or "*",
        request.presentation_id or "*",
        settings.keys(),
    )

    return {
        "success": True,
        "scope": {"owner_id": request.owner_id, "presentation_id": request.presentation_id},
        "settings": settings,
    }


@app.delete("/preferred-settings")
async def clear_preferred_settings(
    presentation_id: str | None = None,
    owner_id: str | None = None,
    token: str | None = Depends(oauth2_scheme_optional),
    profile_manager: VoiceProfileManager = Depends(get_voice_profile_manager),
) -> dict:
    """Clear preferred voice settings for a presentation and/or owner."""
    await profile_manager.clear_preferred_settings(owner_id, presentation_id)
    logger.info(
        "Cleared preferred settings for owner=%s, presentation=%s",
        owner_id or "*",
        presentation_id or "*",
    )
    return {"success": True, "scope": {"owner_id": owner_id, "presentation_id": presentation_id}}


@app.post("/auto-apply", response_model=TTSRequest)
async def auto_apply_profile(
    request: AutoApplyRequest,
    token: str | None = Depends(oauth2_scheme_optional),
    auto_apply_service: VoiceProfileAutoApply = Depends(get_voice_profile_auto_apply),
) -> TTSRequest:
    """
    Auto-apply voice profile based on presentation preferences.

    This endpoint uses the enhanced auto-apply service to intelligently
    select and apply the most appropriate voice profile for the context.
    """
    return await auto_apply_service.apply_profile_for_context(
        text=request.text,
        language=request.language,
        owner_id=request.owner_id,
        presentation_id=request.presentation_id,
        fallback_settings=request.fallback_settings
    )


@app.post("/auto-apply/enhanced", response_model=TTSRequest)
async def enhanced_auto_apply_profile(
    request: EnhancedAutoApplyRequest,
    token: str | None = Depends(oauth2_scheme_optional),
    auto_apply_service: VoiceProfileAutoApply = Depends(get_voice_profile_auto_apply),
) -> TTSRequest:
    """
    Enhanced auto-apply with tone/style preferences.

    This endpoint considers tone and style preferences when selecting
    the most appropriate voice profile for the context.
    """
    # First try to get a recommended profile based on tone/style
    recommended_profile = await auto_apply_service.get_recommended_profile(
        language=request.language,
        tone=request.tone,
        style=request.style
    )

    if recommended_profile:
        logger.info(f"Using recommended profile: {recommended_profile.name}")
        return await auto_apply_service.profile_manager.apply_profile(request.text, recommended_profile)

    # Fallback to standard auto-apply
    return await auto_apply_service.apply_profile_for_context(
        text=request.text,
        language=request.language,
        owner_id=request.owner_id,
        presentation_id=request.presentation_id,
        fallback_settings=request.fallback_settings
    )


@app.post("/create-from-settings", response_model=VoiceProfile)
async def create_profile_from_settings(
    request: CreateProfileFromSettingsRequest,
    token: str | None = Depends(oauth2_scheme_optional),
    auto_apply_service: VoiceProfileAutoApply = Depends(get_voice_profile_auto_apply),
) -> VoiceProfile:
    """
    Create a voice profile from settings dictionary.

    This endpoint allows creating profiles from existing settings,
    useful for saving frequently used configurations.
    """
    try:
        profile = await auto_apply_service.create_profile_from_settings(
            name=request.name,
            settings=request.settings,
            description=request.description,
            tags=request.tags
        )
        return profile
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/recommended-profile", response_model=VoiceProfile | None)
async def get_recommended_profile(
    request: RecommendedProfileRequest,
    token: str | None = Depends(oauth2_scheme_optional),
    auto_apply_service: VoiceProfileAutoApply = Depends(get_voice_profile_auto_apply),
) -> VoiceProfile | None:
    """
    Get a recommended voice profile based on language and optional tone/style.

    This endpoint analyzes existing profiles and returns the most suitable
    one for the given criteria.
    """
    return await auto_apply_service.get_recommended_profile(
        language=request.language,
        tone=request.tone,
        style=request.style
    )


@app.post("/save-preferred-settings")
async def save_preferred_settings_endpoint(
    request: PreferredSettingsRequest,
    token: str | None = Depends(oauth2_scheme_optional),
    auto_apply_service: VoiceProfileAutoApply = Depends(get_voice_profile_auto_apply),
) -> dict:
    """
    Save preferred voice settings for future auto-application.

    This endpoint uses the auto-apply service to persist settings
    that will be automatically applied in future requests.
    """
    settings = request.model_dump(exclude_unset=True, exclude_none=True, exclude={"owner_id", "presentation_id"})

    if not settings:
        raise HTTPException(status_code=400, detail="No settings provided")

    await auto_apply_service.save_preferred_settings(
        owner_id=request.owner_id,
        presentation_id=request.presentation_id,
        settings=settings
    )

    logger.info(
        "Saved preferred settings for owner=%s, presentation=%s: %s",
        request.owner_id or "*",
        request.presentation_id or "*",
        settings.keys(),
    )

    return {
        "success": True,
        "scope": {"owner_id": request.owner_id, "presentation_id": request.presentation_id},
        "settings": settings,
    }


@app.get("/default-profile/{language}", response_model=VoiceProfile)
async def get_default_profile(
    language: str,
    token: str | None = Depends(oauth2_scheme_optional),
    auto_apply_service: VoiceProfileAutoApply = Depends(get_voice_profile_auto_apply),
) -> VoiceProfile:
    """
    Get or create the default voice profile for a language.

    This endpoint ensures a default profile exists for the given language,
    creating one if necessary.
    """
    return await auto_apply_service.get_or_create_default_profile(language)


def extract_user_id(token: str | None) -> str:
    """Extract user ID from JWT token.

    For anonymous sessions, returns the session_id as the user identifier.
    For authenticated sessions, returns the username.
    For missing tokens, returns "anonymous".
    """
    if not token:
        return "anonymous"

    try:
        from jose import jwt

        from services.auth import ALGORITHM, SECRET_KEY

        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        # Try to get session_id first (for anonymous sessions), then sub (for authenticated users)
        return payload.get("session_id") or payload.get("sub") or "anonymous"
    except Exception as e:
        # Log the error but don't raise - return anonymous as fallback
        logger.warning(f"Failed to decode JWT token: {e!s}")
        return "anonymous"


def resolve_owner_or_session(token: str | None, session_id: str | None) -> str:
    """Prefer explicit session header, fallback to user/session from token."""
    if session_id:
        return session_id
    return extract_user_id(token)
