"""FastAPI application for managing voice profiles."""

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from services.auth import oauth2_scheme
from services.voice_profiles.manager import (
    VoiceProfileManager,
    VoiceProfileNotFoundError,
)
from shared.models import TTSRequest, VoiceProfile, VoiceProfileRequest
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

manager = VoiceProfileManager()
app.state.voice_profile_manager = manager


def get_voice_profile_manager() -> VoiceProfileManager:
    return app.state.voice_profile_manager


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


@app.get("/health")
async def health_check():
    """Health endpoint for voice profile service."""
    return {"status": "ok", "service": "voice-profiles"}


@app.post("/create", response_model=VoiceProfile, status_code=201)
async def create_voice_profile(
    request: VoiceProfileRequest,
    token: str = Depends(oauth2_scheme),
    profile_manager: VoiceProfileManager = Depends(get_voice_profile_manager),
) -> VoiceProfile:
    """Create a new reusable voice profile."""
    try:
        profile = await profile_manager.create_profile(request)
        return profile
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/list", response_model=list[VoiceProfile])
async def list_voice_profiles(
    token: str = Depends(oauth2_scheme),
    profile_manager: VoiceProfileManager = Depends(get_voice_profile_manager),
) -> list[VoiceProfile]:
    """List all available voice profiles."""
    profiles = await profile_manager.list_profiles()
    return profiles


@app.get("/{profile_id}", response_model=VoiceProfile)
async def get_voice_profile(
    profile_id: str,
    token: str = Depends(oauth2_scheme),
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
    token: str = Depends(oauth2_scheme),
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
    token: str = Depends(oauth2_scheme),
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
    token: str = Depends(oauth2_scheme),
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
    token: str = Depends(oauth2_scheme),
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
    token: str = Depends(oauth2_scheme),
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
    token: str = Depends(oauth2_scheme),
    profile_manager: VoiceProfileManager = Depends(get_voice_profile_manager),
) -> TTSRequest:
    """
    Auto-apply voice profile based on presentation preferences.

    This endpoint looks up the preferred voice settings for the given
    presentation_id and owner_id, then generates a TTS request with those settings.
    If no preferences are found, returns default settings.
    """
    # Get preferred settings for this presentation/owner
    settings = await profile_manager.get_preferred_settings(request.owner_id, request.presentation_id)

    if not settings:
        # No preferences found, use defaults
        logger.info(
            "No preferred settings found for owner=%s, presentation=%s, using defaults",
            request.owner_id or "*",
            request.presentation_id,
        )
        from shared.models import TTSRequest

        return TTSRequest(
            text=request.text,
            voice="en-US-AriaNeural",
            speed=1.0,
            pitch=0,
            volume=1.0,
            language="en-US",
        )

    # Apply preferred settings
    logger.info(
        "Applying preferred settings for owner=%s, presentation=%s",
        request.owner_id or "*",
        request.presentation_id,
    )

    from shared.models import TTSRequest

    return TTSRequest(
        text=request.text,
        voice=settings.get("voice", "en-US-AriaNeural"),
        speed=settings.get("speed", 1.0),
        pitch=settings.get("pitch", 0),
        volume=settings.get("volume", 1.0),
        language=settings.get("language", "en-US"),
        driver=settings.get("provider"),
    )
