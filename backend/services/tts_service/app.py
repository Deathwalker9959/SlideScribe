import os

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_async_db
from services.auth import oauth2_scheme
from services.ssml_builder.service import LexiconManager, SSMLBuilder
from services.tts_service.drivers.azure import AzureTTSEngine
from services.tts_service.drivers.chatterbox import ChatterboxTTSEngine
from services.tts_service.drivers.openai_tts import OpenAITTSEngine
from services.tts_service.fallback import TTSFallbackManager
from services.voice_profiles.manager import VoiceProfileManager, VoiceProfileNotFoundError
from shared.models import (
    EnhancedTTSRequest,
    PronunciationLexicon,
    PronunciationLexiconRequest,
    SSMLRequest,
    SSMLTTSRequest,
    TTSRequest,
)

AZURE_SPEECH_KEY = os.environ.get("AZURE_SPEECH_KEY", "your_azure_speech_key")
AZURE_SPEECH_REGION = os.environ.get("AZURE_SPEECH_REGION", "eastus")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
MEDIA_ROOT = os.environ.get("MEDIA_ROOT", "/app/media")

TTS_DRIVERS = {
    "azure": AzureTTSEngine(AZURE_SPEECH_KEY, AZURE_SPEECH_REGION),
    "chatterbox": ChatterboxTTSEngine(),
}

# Add OpenAI driver if API key is available
if OPENAI_API_KEY:
    TTS_DRIVERS["openai"] = OpenAITTSEngine(OPENAI_API_KEY)

DEFAULT_DRIVER = "azure"

# Initialize SSML Builder services
ssml_builder = SSMLBuilder()
lexicon_manager = LexiconManager()

# Initialize fallback manager
fallback_manager = TTSFallbackManager(TTS_DRIVERS, DEFAULT_DRIVER)


async def get_voice_profile_manager(session: AsyncSession = Depends(get_async_db)) -> VoiceProfileManager:
    """Get voice profile manager with async session for resolving custom voices."""
    return VoiceProfileManager(session=session)

app = FastAPI(
    title="TTS Service",
    description="Text-to-Speech service with SSML Builder integration and provider fallback",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/synthesize")
async def synthesize_tts(
    req: TTSRequest,
    token: str = Depends(oauth2_scheme),
    voice_profile_manager: VoiceProfileManager = Depends(get_voice_profile_manager),
):
    """Synthesize speech with automatic provider fallback and custom voice detection."""
    try:
        # Check if voice is a custom profile ID (UUID format)
        audio_prompt_path = None
        driver = req.driver or DEFAULT_DRIVER

        if req.voice and len(req.voice) == 36:  # UUID format
            try:
                profile = await voice_profile_manager.get_profile(req.voice)
                if profile.voice_type.name.lower() == "custom_cloned":
                    audio_prompt_path = profile.audio_sample_path
                    driver = "chatterbox"
            except VoiceProfileNotFoundError:
                pass

        # If chatterbox is unavailable, fallback to default driver without custom prompt
        if driver == "chatterbox" and not fallback_manager.is_driver_available("chatterbox"):
            driver = DEFAULT_DRIVER
            audio_prompt_path = None

        result = await fallback_manager.synthesize_with_fallback(
            text=req.text,
            voice=req.voice or "en-US-AriaNeural",
            speed=req.speed or 1.0,
            pitch=req.pitch or 0,
            output_format=req.output_format or "mp3",
            language=req.language,
            preferred_driver=driver,
            audio_prompt_path=audio_prompt_path,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.post("/synthesize-ssml")
async def synthesize_from_ssml(req: SSMLTTSRequest, token: str = Depends(oauth2_scheme)):
    """Synthesize speech from pre-generated SSML markup with automatic fallback."""
    try:
        result = await fallback_manager.synthesize_ssml_with_fallback(
            ssml=req.ssml,
            output_format=req.output_format,
            preferred_driver=req.driver,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.post("/synthesize-enhanced")
async def synthesize_enhanced(req: EnhancedTTSRequest, token: str = Depends(oauth2_scheme)):
    """Enhanced TTS synthesis with automatic SSML generation."""
    driver_name = req.driver or DEFAULT_DRIVER
    driver = TTS_DRIVERS.get(driver_name)
    if not driver:
        raise HTTPException(status_code=400, detail=f"TTS driver '{driver_name}' not found.")

    try:
        if req.use_ssml_builder:
            # Generate SSML using SSML Builder service (works best with Azure, but fallback will handle other providers)

            # Load pronunciation lexicon if specified
            lexicon = None
            if req.lexicon_owner:
                lexicon_request = PronunciationLexiconRequest(
                    owner=req.lexicon_owner,
                    scope=req.lexicon_scope
                )
                try:
                    lexicon = await lexicon_manager.get_lexicon(lexicon_request)
                except Exception:
                    # Continue without lexicon if not found
                    lexicon = PronunciationLexicon(
                        owner=req.lexicon_owner,
                        scope=req.lexicon_scope,
                        entries=[]
                    )

            # Generate SSML
            ssml_request = SSMLRequest(
                text=req.text,
                emphasis_words=req.emphasis_words,
                pauses=req.pauses,
                prosody_rate=req.speed,
                prosody_pitch=f"{req.pitch}%" if req.pitch != 0 else None,
                preset=req.ssml_preset
            )

            ssml_response = ssml_builder.build_ssml(
                ssml_request,
                voice=req.voice or "en-US-AriaNeural",
                lexicon=lexicon
            )

            # Use fallback manager for SSML synthesis
            result = await fallback_manager.synthesize_ssml_with_fallback(
                ssml=ssml_response.ssml,
                output_format=req.output_format,
                preferred_driver="azure",  # Prefer Azure for SSML support
            )
            result["ssml_generated"] = True
            result["ssml_used"] = ssml_response.ssml[:200] + "..." if len(ssml_response.ssml) > 200 else ssml_response.ssml
            result["ssml_builder_preset"] = req.ssml_preset
            result["lexicon_used"] = lexicon.owner if lexicon else None
        else:
            # Use fallback manager for regular synthesis
            result = await fallback_manager.synthesize_with_fallback(
                text=req.text,
                voice=req.voice or "en-US-AriaNeural",
                speed=req.speed,
                pitch=req.pitch,
                output_format=req.output_format,
                language=req.language,
                preferred_driver=req.driver,
            )
            result["ssml_generated"] = False

        result["enhanced_mode"] = True
        result["original_request_driver"] = req.driver
        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/voices")
async def get_supported_voices(provider: str = DEFAULT_DRIVER, token: str = Depends(oauth2_scheme)):
    """Return supported voices for a given provider."""
    driver = TTS_DRIVERS.get(provider)
    if not driver:
        raise HTTPException(status_code=404, detail=f"Provider '{provider}' not found")
    voices = getattr(driver, "SUPPORTED_VOICES", None)
    return {"provider": provider, "voices": voices or []}


@app.get("/drivers")
async def get_available_drivers(token: str = Depends(oauth2_scheme)):
    """Get list of available TTS drivers and their capabilities."""
    drivers_info = {}
    for driver_name, driver in TTS_DRIVERS.items():
        is_available = fallback_manager.is_driver_available(driver_name)
        info = {"name": driver_name, "available": is_available}
        if hasattr(driver, "SUPPORTED_VOICES"):
            info["supported_voices"] = driver.SUPPORTED_VOICES
        if hasattr(driver, "SUPPORTED_FORMATS"):
            info["supported_formats"] = driver.SUPPORTED_FORMATS
        if hasattr(driver, "SUPPORTED_MODELS"):
            info["supported_models"] = driver.SUPPORTED_MODELS
        drivers_info[driver_name] = info

    return {
        "drivers": drivers_info,
        "default": DEFAULT_DRIVER,
        "fallback_chain": fallback_manager.fallback_chain,
        "currently_available": fallback_manager.get_available_drivers()
    }


@app.get("/fallback/status")
async def get_fallback_status(token: str = Depends(oauth2_scheme)):
    """Get current fallback manager status and health."""
    return {
        "available_drivers": fallback_manager.get_available_drivers(),
        "disabled_drivers": list(fallback_manager.disabled_drivers),
        "fallback_chain": fallback_manager.fallback_chain,
        "total_drivers": len(TTS_DRIVERS),
        "default_driver": DEFAULT_DRIVER
    }


@app.post("/fallback/drivers/{driver_name}/disable")
async def disable_driver(driver_name: str, reason: str = "manual", token: str = Depends(oauth2_scheme)):
    """Manually disable a TTS driver (for maintenance, etc.)."""
    if driver_name not in TTS_DRIVERS:
        raise HTTPException(status_code=404, detail=f"TTS driver '{driver_name}' not found.")

    fallback_manager.manually_disable_driver(driver_name, reason)
    return {"message": f"Driver '{driver_name}' disabled successfully", "reason": reason}


@app.post("/fallback/drivers/{driver_name}/enable")
async def enable_driver(driver_name: str, token: str = Depends(oauth2_scheme)):
    """Manually re-enable a disabled TTS driver."""
    if driver_name not in TTS_DRIVERS:
        raise HTTPException(status_code=404, detail=f"TTS driver '{driver_name}' not found.")

    fallback_manager.manually_enable_driver(driver_name)
    return {"message": f"Driver '{driver_name}' enabled successfully"}
