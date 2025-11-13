"""Analytics Service API - Track job metrics and user feedback for thesis research."""

from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Query, Depends, Response
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from services.auth import oauth2_scheme
from services.analytics.service import AnalyticsService
from shared.models import (
    JobMetricsRequest,
    JobMetricsResponse,
    UserFeedbackRequest,
    UserFeedbackResponse,
    TelemetryExportRequest,
    TelemetryExportResponse
)
from shared.utils import setup_logging

logger = setup_logging("analytics-service")

app = FastAPI(
    title="Analytics Service",
    description="Telemetry collection and export for thesis research",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Initialize analytics service
analytics_service = AnalyticsService()

# Mount static files for exports
exports_dir = Path(analytics_service.export_dir)
if exports_dir.exists():
    app.mount("/exports", StaticFiles(directory=str(exports_dir)), name="exports")


@app.post("/metrics/job", response_model=JobMetricsResponse, tags=["Job Metrics"])
async def record_job_metrics(
    request: JobMetricsRequest,
    token: str = Depends(oauth2_scheme)
) -> JobMetricsResponse:
    """Record performance and user behavior metrics for a completed job.

    This endpoint should be called when a narration job completes to collect
    performance metrics and user interaction data for thesis analysis.

    Args:
        request: Job metrics data including timing, performance, and user behavior
        token: Authentication token

    Returns:
        Confirmation of recorded metrics with timestamp
    """
    try:
        result = await analytics_service.record_job_metrics(request)
        logger.info(f"Job metrics recorded for {request.job_id}")
        return result
    except Exception as e:
        logger.error(f"Failed to record job metrics: {e!s}")
        raise HTTPException(status_code=500, detail=f"Failed to record metrics: {e!s}") from e


@app.post("/feedback/user", response_model=UserFeedbackResponse, tags=["User Feedback"])
async def record_user_feedback(
    request: UserFeedbackRequest,
    token: str = Depends(oauth2_scheme)
) -> UserFeedbackResponse:
    """Record user feedback and SUS (System Usability Scale) scores.

    This endpoint captures user satisfaction and usability metrics for thesis research.
    The SUS questionnaire provides a standardized measure of system usability.

    Args:
        request: User feedback including SUS questionnaire responses
        token: Authentication token

    Returns:
        Confirmation with calculated SUS score
    """
    try:
        result = await analytics_service.record_user_feedback(request)
        logger.info(f"User feedback recorded with SUS score {result.sus_score}")
        return result
    except Exception as e:
        logger.error(f"Failed to record user feedback: {e!s}")
        raise HTTPException(status_code=500, detail=f"Failed to record feedback: {e!s}") from e


@app.post("/export/telemetry", response_model=TelemetryExportResponse, tags=["Telemetry Export"])
async def export_telemetry_data(
    request: TelemetryExportRequest,
    token: str = Depends(oauth2_scheme)
) -> TelemetryExportResponse:
    """Export telemetry data in JSON or CSV format for thesis analysis.

    Creates downloadable files containing job metrics, user feedback,
    and optionally API usage data for the specified time range.

    Args:
        request: Export configuration including format and filters
        token: Authentication token

    Returns:
        Download URL and metadata for the exported file
    """
    try:
        result = await analytics_service.export_telemetry_data(request)
        logger.info(f"Telemetry export created: {result.export_url}")
        return result
    except Exception as e:
        logger.error(f"Failed to export telemetry data: {e!s}")
        raise HTTPException(status_code=500, detail=f"Failed to export data: {e!s}") from e


@app.get("/exports/{filename}", tags=["Telemetry Export"])
async def download_export_file(filename: str, token: str = Depends(oauth2_scheme)) -> FileResponse:
    """Download a previously generated telemetry export file.

    Args:
        filename: Name of the export file to download
        token: Authentication token

    Returns:
        The export file as a downloadable response
    """
    try:
        file_path = exports_dir / filename

        if not file_path.exists():
            raise HTTPException(status_code=404, detail="Export file not found")

        # Check if file has expired
        file_age = datetime.now().timestamp() - file_path.stat().st_mtime
        max_age_seconds = analytics_service.export_ttl_hours * 3600

        if file_age > max_age_seconds:
            file_path.unlink()  # Delete expired file
            raise HTTPException(status_code=410, detail="Export file has expired")

        return FileResponse(
            path=str(file_path),
            filename=filename,
            media_type="application/octet-stream"
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to download export file: {e!s}")
        raise HTTPException(status_code=500, detail=f"Failed to download file: {e!s}") from e


@app.get("/stats/summary", tags=["Analytics"])
async def get_summary_stats(
    start_date: Optional[datetime] = Query(None, description="Filter start date"),
    end_date: Optional[datetime] = Query(None, description="Filter end date"),
    token: str = Depends(oauth2_scheme)
) -> dict:
    """Get summary statistics for thesis analysis.

    Returns aggregated metrics including job counts, performance percentiles,
    provider distribution, and degraded mode usage statistics.

    Args:
        start_date: Optional start date for filtering
        end_date: Optional end date for filtering
        token: Authentication token

    Returns:
        Summary statistics dictionary
    """
    try:
        result = await analytics_service.get_job_summary_stats(start_date, end_date)
        logger.info("Summary statistics retrieved")
        return result
    except Exception as e:
        logger.error(f"Failed to get summary stats: {e!s}")
        raise HTTPException(status_code=500, detail=f"Failed to get statistics: {e!s}") from e


@app.get("/health", tags=["Health"])
async def health_check() -> dict:
    """Health check endpoint for the analytics service."""
    return {
        "status": "healthy",
        "service": "analytics",
        "timestamp": datetime.utcnow().isoformat(),
        "exports_dir": str(exports_dir),
        "exports_dir_exists": exports_dir.exists()
    }


@app.get("/", tags=["Info"])
async def root() -> dict:
    """Root endpoint with service information."""
    return {
        "service": "Analytics Service",
        "version": "1.0.0",
        "description": "Telemetry collection and export for thesis research",
        "endpoints": {
            "job_metrics": "/metrics/job",
            "user_feedback": "/feedback/user",
            "telemetry_export": "/export/telemetry",
            "summary_stats": "/stats/summary",
            "health": "/health",
            "docs": "/docs"
        },
        "documentation": "https://slidescribe.dev/docs/analytics"
    }