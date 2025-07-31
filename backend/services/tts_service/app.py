from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
from backend.services.tts_service.drivers.azure import AzureTTSEngine
from backend.services.tts_service.drivers.base import TTSEngine
from typing import Optional

# Config (could be loaded from env or config file)
AZURE_SPEECH_KEY = os.environ.get("AZURE_SPEECH_KEY", "your_azure_speech_key")
AZURE_SPEECH_REGION = os.environ.get("AZURE_SPEECH_REGION", "eastus")
MEDIA_ROOT = os.environ.get("MEDIA_ROOT", "/app/media")

# TTS Driver registry (for future extensibility)
TTS_DRIVERS = {
    "azure": AzureTTSEngine(AZURE_SPEECH_KEY, AZURE_SPEECH_REGION),
    # Add more providers here
}
DEFAULT_DRIVER = "azure"

# FastAPI app
app = FastAPI(
    title="TTS Service",
    description="Text-to-Speech service with pluggable drivers",
    version="1.0.0"
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
    voice: Optional[str] = "en-US-AriaNeural"
    speed: Optional[float] = 1.0
    pitch: Optional[float] = 0
    output_format: Optional[str] = "mp3"
    driver: Optional[str] = None

@app.post("/synthesize")
async def synthesize_tts(req: TTSRequest):
    driver_name = req.driver or DEFAULT_DRIVER
    driver: TTSEngine = TTS_DRIVERS.get(driver_name)
    if not driver:
        raise HTTPException(status_code=400, detail=f"TTS driver '{driver_name}' not found.")
    try:
        result = await driver.synthesize(
            text=req.text,
            voice=req.voice,
            speed=req.speed,
            pitch=req.pitch,
            output_format=req.output_format
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
def health():
    return {"status": "ok"}
