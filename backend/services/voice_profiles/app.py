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
