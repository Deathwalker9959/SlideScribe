"""Narration service API endpoints for PowerPoint presentation processing."""

from datetime import UTC
import json
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from services.auth import oauth2_scheme
from services.narration.orchestrator import NarrationOrchestrator
from shared.models import (
    APIResponse,
    ExportRequest,
    ExportResponse,
    PresentationRequest,
    SlideContent,
    SlideProcessingRequest,
)
from shared.utils import config, setup_logging

logger = setup_logging("narration-service")

app = FastAPI(
    title="Narration Service",
    description="AI-powered narration processing for PowerPoint presentations",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.get("allowed_origins", ["*"]),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize orchestrator
orchestrator = NarrationOrchestrator()


@app.get("/health")
async def health_check():
    """Health check endpoint for the narration service."""
    return APIResponse(message="Narration Service is healthy")


@app.post("/process-presentation", response_model=dict)
async def process_presentation(
    request: PresentationRequest, token: str = Depends(oauth2_scheme)
) -> dict:
    """Start processing a presentation for narration generation.

    This endpoint initiates the complete narration pipeline:
    1. AI refinement of slide content
    2. Text-to-speech synthesis
    3. Subtitle generation
    4. Export with embedded audio

    Returns a job ID for tracking progress.
    """
    try:
        if not request.slides:
            raise HTTPException(
                status_code=400,
                detail="Presentation must contain at least one slide"
            )

        job_id = await orchestrator.process_presentation(request)

        logger.info(f"Started narration processing job {job_id} with {len(request.slides)} slides")

        return {
            "job_id": job_id,
            "status": "queued",
            "total_slides": len(request.slides),
            "message": "Processing started. Use the job ID to track progress."
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to start presentation processing: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to start processing: {e!s}") from e


@app.post("/process-slide", response_model=dict)
async def process_slide(
    request: SlideProcessingRequest,
    token: str = Depends(oauth2_scheme)
) -> dict:
    """Process an individual slide for narration generation.

    This endpoint processes a single slide through the complete pipeline
    and returns the processed result immediately.
    """
    try:
        slide = SlideContent(
            slide_id=request.slide_id,
            title=request.slide_title,
            content=request.slide_content,
            notes=request.slide_notes,
            layout=request.slide_layout,
            images=request.images,
        )

        # Generate a temporary job ID for single slide processing
        import time

        from shared.utils import generate_hash
        job_id = generate_hash(f"single_slide_{request.slide_id}_{int(time.time())}")

        context_overrides = {
            "presentation_title": request.presentation_title,
            "section_title": request.section_title,
            "audience": request.audience,
            "previous_slide_summary": request.previous_slide_summary,
            "next_slide_summary": request.next_slide_summary,
            "total_slides": request.total_slides,
            "topic_keywords": request.topic_keywords,
        }

        result = await orchestrator.process_slide(
            job_id,
            slide,
            request.slide_number,
            presentation=None,
            context_overrides=context_overrides,
        )

        logger.info(
            "Processed single slide %s for presentation %s",
            request.slide_id,
            request.presentation_id,
        )

        return {
            "job_id": job_id,
            "slide_number": request.slide_number,
            "slide_id": request.slide_id,
            "result": result,
            "status": "completed"
        }

    except Exception as e:
        logger.error(f"Failed to process slide {request.slide_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to process slide: {e!s}") from e


@app.get("/status/{job_id}", response_model=dict)
async def get_job_status(job_id: str, token: str = Depends(oauth2_scheme)) -> dict:
    """Get the current status and progress of a narration processing job.

    Returns detailed information about:
    - Current job status (queued, processing, completed, failed)
    - Processing progress (percentage, current slide)
    - Estimated time remaining
    - Any error messages if processing failed
    """
    try:
        job_status = await orchestrator.get_job_status(job_id)

        if not job_status:
            raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

        return job_status

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get job status for {job_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get job status: {e!s}") from e


@app.post("/cancel/{job_id}", response_model=dict)
async def cancel_job(job_id: str, token: str = Depends(oauth2_scheme)) -> dict:
    """Cancel a running narration processing job.

    Attempts to cancel the job if it's still in a cancellable state
    (queued or processing). Returns whether the cancellation was successful.
    """
    try:
        cancelled = await orchestrator.cancel_job(job_id)

        if not cancelled:
            # Check if job exists
            job_status = await orchestrator.get_job_status(job_id)
            if not job_status:
                raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
            else:
                return {
                    "job_id": job_id,
                    "cancelled": False,
                    "message": f"Job {job_status['status']} cannot be cancelled"
                }

        logger.info(f"Cancelled narration job {job_id}")

        return {
            "job_id": job_id,
            "cancelled": True,
            "message": "Job cancelled successfully"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to cancel job {job_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to cancel job: {e!s}") from e


@app.post("/export-presentation", response_model=ExportResponse)
async def export_presentation(
    request: ExportRequest, token: str = Depends(oauth2_scheme)
) -> ExportResponse:
    """Export a processed presentation with narration and subtitles.

    This endpoint creates the final export package containing:
    - PowerPoint file with embedded audio
    - Subtitle files (.srt format)
    - Audio files (separate)

    The export is available for download for 24 hours.
    """
    try:
        # For now, create a mock export response
        # In a full implementation, this would:
        # 1. Retrieve processed job data
        # 2. Combine audio files
        # 3. Generate final PPTX with embedded audio
        # 4. Create subtitle files
        # 5. Return download information

        from datetime import datetime, timedelta

        from shared.utils import generate_hash

        export_id = generate_hash(f"export_{request.presentation_id}_{int(datetime.now(UTC).timestamp())}")

        logger.info(f"Created export {export_id} for presentation {request.presentation_id}")

        now = datetime.now(UTC)
        return ExportResponse(
            export_id=export_id,
            download_url=f"/api/v1/narration/download/{export_id}",
            file_size=1024000,  # Mock size
            export_format=request.export_format,
            created_at=now,
            expires_at=now + timedelta(hours=24),
        )

    except Exception as e:
        logger.error(f"Failed to export presentation {request.presentation_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Export failed: {e!s}") from e


@app.get("/manifest/{job_id}", response_model=dict)
async def get_manifest(job_id: str, token: str = Depends(oauth2_scheme)) -> dict:
    """Retrieve the export manifest for a completed narration job."""
    try:
        manifest_path = Path(orchestrator.media_root) / job_id / "manifest.json"
        if not manifest_path.exists():
            raise HTTPException(status_code=404, detail=f"Manifest for job {job_id} not found")
        try:
            return json.loads(manifest_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=500, detail="Manifest file is corrupted") from exc
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover - defensive fallback
        logger.error("Failed to load manifest for job %s: %s", job_id, exc)
        raise HTTPException(status_code=500, detail="Failed to load manifest") from exc


@app.get("/download/{export_id}")
async def download_export(export_id: str, token: str = Depends(oauth2_scheme)):
    """Download an exported presentation package.

    This endpoint serves the exported files. In a full implementation,
    this would return the actual file with appropriate headers.
    """
    try:
        # Mock implementation - would serve actual file
        return {
            "export_id": export_id,
            "message": "Download endpoint not fully implemented",
            "note": "In production, this would serve the actual exported file"
        }

    except Exception as e:
        logger.error(f"Failed to serve download for {export_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Download failed: {e!s}") from e


@app.get("/jobs")
async def list_jobs(
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
    token: str = Depends(oauth2_scheme)
) -> dict:
    """List narration processing jobs with optional filtering.

    Supports filtering by status and pagination for large result sets.
    """
    try:
        # Mock implementation - would query actual job storage
        return {
            "jobs": [],
            "total": 0,
            "limit": limit,
            "offset": offset,
            "status_filter": status,
            "message": "Job listing not fully implemented"
        }

    except Exception as e:
        logger.error(f"Failed to list jobs: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to list jobs: {e!s}") from e


if __name__ == "__main__":
    try:
        import uvicorn
    except ImportError as e:
        raise RuntimeError("uvicorn must be installed to run this service.") from e
    uvicorn.run(app, host="0.0.0.0", port=8003)
