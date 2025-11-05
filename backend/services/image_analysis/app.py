"""FastAPI app for the image analysis service."""

from fastapi import Depends, FastAPI, HTTPException, Response

from services.auth import oauth2_scheme
from services.image_analysis.service import ImageAnalysisService
from shared.models import ImageAnalysisRequest, ImageAnalysisResponse
from shared.utils import setup_logging


logger = setup_logging("image-analysis-api")

app = FastAPI(
    title="Image Analysis Service",
    description="Generate contextual descriptions for slide visuals",
    version="1.0.0",
)

service = ImageAnalysisService()


@app.post("/analyze", response_model=ImageAnalysisResponse)
async def analyze_images(
    request: ImageAnalysisRequest,
    token: str = Depends(oauth2_scheme),
) -> ImageAnalysisResponse:
    """Analyze a batch of slide images and return contextual metadata."""
    try:
        return await service.analyze_slide_images(request)
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover - defensive logging
        logger.error("Image analysis failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Image analysis failed: {exc!s}") from exc


@app.get("/captions/{slide_id}", response_model=ImageAnalysisResponse)
async def get_slide_captions(
    slide_id: str,
    presentation_id: str,
    token: str = Depends(oauth2_scheme),
) -> ImageAnalysisResponse:
    """Return cached captions for a slide if previously analyzed."""
    cached = await service.get_cached_analysis(presentation_id, slide_id)
    if not cached:
        raise HTTPException(status_code=404, detail="No cached analysis for requested slide")
    return cached


@app.delete("/cache/{presentation_id}/{slide_id}", status_code=204)
async def purge_cached_slide(
    presentation_id: str,
    slide_id: str,
    token: str = Depends(oauth2_scheme),
) -> Response:
    """Remove cached analysis for a slide."""
    service.purge_cached_analysis(presentation_id, slide_id)
    return Response(status_code=204)


@app.get("/jobs/{job_id}", response_model=dict)
async def get_analysis_job_status(
    job_id: str,
    token: str = Depends(oauth2_scheme),
) -> dict:
    """Fetch the status for an asynchronous image analysis job."""
    status = service.get_job_status(job_id)
    if not status:
        raise HTTPException(status_code=404, detail="Job not found")
    return status
