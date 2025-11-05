import os

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from services.auth import oauth2_scheme
from services.tts_service.drivers.azure import AzureTTSEngine
from services.tts_service.drivers.openai_tts import OpenAITTSEngine

AZURE_SPEECH_KEY = os.environ.get("AZURE_SPEECH_KEY", "your_azure_speech_key")
AZURE_SPEECH_REGION = os.environ.get("AZURE_SPEECH_REGION", "eastus")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
MEDIA_ROOT = os.environ.get("MEDIA_ROOT", "/app/media")

TTS_DRIVERS = {
    "azure": AzureTTSEngine(AZURE_SPEECH_KEY, AZURE_SPEECH_REGION),
}

# Add OpenAI driver if API key is available
if OPENAI_API_KEY:
    TTS_DRIVERS["openai"] = OpenAITTSEngine(OPENAI_API_KEY)

DEFAULT_DRIVER = "azure"

app = FastAPI(
    title="TTS Service",
    description="Text-to-Speech service with pluggable drivers",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class TTSRequest(BaseModel):
    text: str
    voice: str | None = "en-US-AriaNeural"
    speed: float | None = 1.0
    pitch: float | None = 0
    output_format: str | None = "mp3"
    driver: str | None = None


@app.post("/synthesize")
async def synthesize_tts(req: TTSRequest, token: str = Depends(oauth2_scheme)):
    driver_name = req.driver or DEFAULT_DRIVER
    driver = TTS_DRIVERS.get(driver_name)
    if not driver:
        raise HTTPException(status_code=400, detail=f"TTS driver '{driver_name}' not found.")
    try:
        result = await driver.synthesize(
            text=req.text,
            voice=req.voice or "en-US-AriaNeural",
            speed=req.speed or 1.0,
            pitch=req.pitch or 0,
            output_format=req.output_format or "mp3",
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/drivers")
async def get_available_drivers(token: str = Depends(oauth2_scheme)):
    """Get list of available TTS drivers and their capabilities."""
    drivers_info = {}
    for driver_name, driver in TTS_DRIVERS.items():
        info = {"name": driver_name, "available": True}
        if hasattr(driver, "SUPPORTED_VOICES"):
            info["supported_voices"] = driver.SUPPORTED_VOICES
        if hasattr(driver, "SUPPORTED_FORMATS"):
            info["supported_formats"] = driver.SUPPORTED_FORMATS
        if hasattr(driver, "SUPPORTED_MODELS"):
            info["supported_models"] = driver.SUPPORTED_MODELS
        drivers_info[driver_name] = info
    return {"drivers": drivers_info, "default": DEFAULT_DRIVER}
