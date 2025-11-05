"""FastAPI application for audio processing."""

from fastapi import Depends, FastAPI, HTTPException

from services.audio_processing.service import AudioProcessor
from services.auth import oauth2_scheme
from shared.models import (
    AudioCombineRequest,
    AudioCombineResponse,
    AudioTransitionRequest,
    AudioTransitionResponse,
)
from shared.utils import setup_logging

logger = setup_logging("audio-processing-api")

app = FastAPI(
    title="Audio Processing Service",
    description="Combine narration audio and apply transitions",
    version="1.0.0",
)

audio_processor = AudioProcessor()


@app.post("/combine", response_model=AudioCombineResponse)
async def combine_audio(
    request: AudioCombineRequest,
    token: str = Depends(oauth2_scheme),
) -> AudioCombineResponse:
    """Combine slide audio segments into a single track."""
    try:
        return await audio_processor.combine_segments(request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover
        logger.error("Audio combine failed: %s", exc)
        raise HTTPException(status_code=500, detail="Audio combine failed") from exc


@app.post("/add-transitions", response_model=AudioTransitionResponse)
async def add_transitions(
    request: AudioTransitionRequest,
    token: str = Depends(oauth2_scheme),
) -> AudioTransitionResponse:
    """Apply transitions (e.g., crossfades) to combined audio."""
    try:
        return await audio_processor.apply_transitions(request)
    except Exception as exc:  # pragma: no cover
        logger.error("Audio transition processing failed: %s", exc)
        raise HTTPException(status_code=500, detail="Audio transition processing failed") from exc


@app.get("/jobs/{job_id}", response_model=dict)
async def get_audio_job(job_id: str, token: str = Depends(oauth2_scheme)) -> dict:
    """Return status information for an audio processing job."""
    status = audio_processor.get_job_status(job_id)
    if not status:
        raise HTTPException(status_code=404, detail="Job not found")
    return status
