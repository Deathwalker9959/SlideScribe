"""FastAPI application for audio processing."""

from pathlib import Path

from datetime import datetime

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.responses import FileResponse

from services.audio_processing.service import AudioProcessor
from services.auth import oauth2_scheme
from shared.models import (
    AudioCombineRequest,
    AudioCombineResponse,
    AudioExportRequest,
    AudioExportResponse,
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


@app.post("/export", response_model=AudioExportResponse)
async def export_audio(
    request: AudioExportRequest,
    token: str = Depends(oauth2_scheme),
) -> AudioExportResponse:
    """Export the current audio mix in the requested format."""
    try:
        return await audio_processor.export_mix(request)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover
        logger.error("Audio export failed: %s", exc)
        raise HTTPException(status_code=500, detail="Audio export failed") from exc


@app.get("/jobs/{job_id}", response_model=dict)
async def get_audio_job(job_id: str, token: str = Depends(oauth2_scheme)) -> dict:
    """Return status information for an audio processing job."""
    status = audio_processor.get_job_status(job_id)
    if not status:
        raise HTTPException(status_code=404, detail="Job not found")
    return status


@app.get("/download/{job_id}")
async def download_audio(
    job_id: str,
    format: str | None = Query(default=None, description="Optional export format to download"),
    token: str = Depends(oauth2_scheme),
) -> FileResponse:
    """Stream the latest audio mix or a specific export for a job."""
    status = audio_processor.get_job_status(job_id)
    if not status:
        raise HTTPException(status_code=404, detail="Job not found")

    target_path: str | None = None

    if format:
        export = audio_processor.get_export(job_id, format)
        if not export:
            raise HTTPException(status_code=404, detail=f"Export with format '{format}' not found")
        target_path = export.get("path")
    else:
        target_path = status.get("transitioned_audio_path") or status.get("combined_audio_path")

    if not target_path or not Path(target_path).exists():
        raise HTTPException(status_code=404, detail="Audio output not available")

    ext = Path(target_path).suffix.lstrip('.') or 'wav'
    media_type = "audio/wav"
    if ext in {"mp3"}:
        media_type = "audio/mpeg"
    elif ext in {"mp4", "m4a"}:
        media_type = "audio/mp4"
    elif ext in {"zip"}:
        media_type = "application/zip"
    elif ext in {"pptx"}:
        media_type = "application/vnd.openxmlformats-officedocument.presentationml.presentation"

    return FileResponse(target_path, media_type=media_type, filename=Path(target_path).name)


@app.get("/exports/{job_id}", response_model=list[AudioExportResponse])
async def list_audio_exports(job_id: str, token: str = Depends(oauth2_scheme)) -> list[AudioExportResponse]:
    """Return all available audio exports for a job."""
    status = audio_processor.get_job_status(job_id)
    if not status:
        raise HTTPException(status_code=404, detail="Job not found")

    exports = status.get("exports") or []
    results: list[AudioExportResponse] = []
    for export in exports:
        if not isinstance(export, dict):
            continue
        created_at = export.get("created_at")
        try:
            created_at_dt = datetime.fromisoformat(created_at) if isinstance(created_at, str) else datetime.now()
        except ValueError:
            created_at_dt = datetime.now()

        response = AudioExportResponse(
            job_id=job_id,
            export_path=export.get("path", ""),
            format=export.get("format", ""),
            file_size=int(export.get("file_size") or 0),
            created_at=created_at_dt,
            download_url=export.get("download_url"),
        )
        results.append(response)

    return results


@app.get("/health", response_model=dict, tags=["Health"])
async def audio_health(token: str = Depends(oauth2_scheme)) -> dict:
    """Return diagnostics for the audio processing service."""
    return audio_processor.get_health_status()
