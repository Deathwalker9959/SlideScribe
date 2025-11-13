"""Subtitle service API endpoints for PowerPoint presentations."""

from datetime import UTC, datetime

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse

from services.auth import oauth2_scheme
from services.subtitles.generator import SubtitleGenerator
from services.subtitles.validator import SubtitleValidator, SubtitleValidationError
from shared.models import (
    APIResponse,
    SubtitleConvertRequest,
    SubtitleEntry,
    SubtitleRequest,
    SubtitleResponse,
    SubtitleSyncRequest,
    SubtitleValidationRequest,
)
from shared.utils import config, setup_logging

logger = setup_logging("subtitle-service")

app = FastAPI(
    title="Subtitle Service",
    description="Subtitle generation and synchronization for PowerPoint presentations",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.get("allowed_origins", ["*"]),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize subtitle generator and validator
subtitle_generator = SubtitleGenerator()
subtitle_validator = SubtitleValidator(
    min_duration=0.5,
    max_duration=10.0,
    max_chars_per_subtitle=100,
    min_gap_between_subtitles=0.1,
)


@app.get("/health")
async def health_check():
    """Health check endpoint for the subtitle service."""
    return APIResponse(message="Subtitle Service is healthy")


@app.post("/generate", response_model=SubtitleResponse)
async def generate_subtitles(
    request: SubtitleRequest, token: str = Depends(oauth2_scheme)
) -> SubtitleResponse:
    """Generate subtitles from text and optionally audio data.

    This endpoint supports multiple generation modes:
    1. Audio + Text: Use speech-to-text for accurate timing alignment
    2. Text only: Generate timing estimates based on speaking rate
    3. Audio URL: Fetch audio from URL and process

    Returns properly timed subtitle entries in the requested format.
    """
    try:
        start_time = datetime.now(UTC)

        if request.audio_url:
            # Fetch audio from URL
            import aiohttp
            async with aiohttp.ClientSession() as session:
                async with session.get(request.audio_url) as response:
                    if response.status == 200:
                        audio_data = await response.read()
                    else:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Failed to fetch audio from URL: {response.status}"
                        )
        else:
            audio_data = None

        # Generate subtitles
        if audio_data:
            subtitles = await subtitle_generator.generate_from_audio(
                audio_data=audio_data,
                text=request.text,
                language=request.language,
            )
        else:
            # Text-only generation with estimated timing
            estimated_duration = len(request.text.split()) * 0.4  # ~0.4s per word
            subtitles = await subtitle_generator.generate_from_text_only(
                text=request.text,
                estimated_duration=estimated_duration,
                language=request.language,
            )

        # Apply formatting constraints
        subtitles = subtitle_generator._apply_formatting_rules(subtitles)

        processing_time = (datetime.now(UTC) - start_time).total_seconds()

        logger.info(f"Generated {len(subtitles)} subtitles in {processing_time:.2f}s")

        return SubtitleResponse(
            subtitles=subtitles,
            total_duration=subtitles[-1].end_time if subtitles else 0.0,
            format="srt",  # Default format, can be extended
            processing_time=processing_time,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to generate subtitles: {e}")
        raise HTTPException(status_code=500, detail=f"Subtitle generation failed: {e!s}") from e


@app.post("/generate-from-audio", response_model=SubtitleResponse)
async def generate_subtitles_from_audio(
    audio_file: UploadFile = File(...),
    text: str = "",
    language: str = "en-US",
    token: str = Depends(oauth2_scheme)
) -> SubtitleResponse:
    """Generate subtitles from uploaded audio file.

    This endpoint accepts audio file uploads and generates subtitles
    with accurate timing using speech-to-text processing.
    """
    try:
        start_time = datetime.now(UTC)

        # Validate audio file
        if not audio_file.content_type or not audio_file.content_type.startswith("audio/"):
            raise HTTPException(status_code=400, detail="Invalid audio file type")

        # Read audio data
        audio_data = await audio_file.read()

        if not audio_data:
            raise HTTPException(status_code=400, detail="Audio file is empty")

        # Generate subtitles from audio
        if text:
            subtitles = await subtitle_generator.generate_from_audio(
                audio_data=audio_data,
                text=text,
                language=language,
            )
        else:
            # Generate subtitles from audio only (transcription mode)
            # For now, return empty response - would implement full transcription
            logger.warning("Text-only audio transcription not fully implemented")
            subtitles = []

        processing_time = (datetime.now(UTC) - start_time).total_seconds()

        return SubtitleResponse(
            subtitles=subtitles,
            total_duration=subtitles[-1].end_time if subtitles else 0.0,
            format="srt",
            processing_time=processing_time,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to generate subtitles from audio: {e}")
        raise HTTPException(status_code=500, detail=f"Audio processing failed: {e!s}") from e


@app.post("/sync-with-slides", response_model=list[dict])
async def sync_subtitles_with_slides(
    request: SubtitleSyncRequest,
    token: str = Depends(oauth2_scheme)
) -> list[dict]:
    """Synchronize subtitle timing with slide transitions.

    Adjusts subtitle timing to fit within slide duration and ensures
    proper spacing between subtitles across slide changes.
    """
    try:
        synchronized_subtitles = await subtitle_generator.sync_with_slides(
            subtitles=request.subtitles,
            slide_duration=request.slide_duration,
            slide_number=request.slide_number,
        )

        # Convert to dict for JSON response
        return [subtitle.model_dump() for subtitle in synchronized_subtitles]

    except Exception as e:
        logger.error(f"Failed to sync subtitles with slides: {e}")
        raise HTTPException(status_code=500, detail=f"Subtitle synchronization failed: {e!s}") from e


@app.post("/convert-format")
async def convert_subtitle_format(
    request: SubtitleConvertRequest,
    token: str = Depends(oauth2_scheme)
) -> PlainTextResponse:
    """Convert subtitles to different formats (SRT, VTT, etc.).

    Returns the converted subtitle content as plain text.
    """
    try:
        target_format = request.target_format.lower()

        if target_format == "srt":
            content = subtitle_generator.convert_to_srt(request.subtitles)
            media_type = "text/plain"
        elif target_format == "vtt":
            content = subtitle_generator.convert_to_vtt(request.subtitles)
            media_type = "text/vtt"
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported format: {target_format}")

        return PlainTextResponse(
            content=content,
            media_type=media_type,
            headers={
                "Content-Disposition": f"attachment; filename=subtitles.{target_format.lower()}"
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to convert subtitle format: {e}")
        raise HTTPException(status_code=500, detail=f"Format conversion failed: {e!s}") from e


@app.post("/validate")
async def validate_subtitles(
    request: SubtitleValidationRequest,
    token: str = Depends(oauth2_scheme)
) -> dict:
    """Validate subtitle entries for formatting and timing issues.

    Uses comprehensive validation including:
    - Ordering checks (index and time)
    - Overlap detection
    - Duration constraints
    - Text length validation
    - Gap analysis

    Returns detailed validation report with violations and warnings.
    """
    try:
        # Use comprehensive subtitle validator
        strict = request.strict if hasattr(request, "strict") else False
        validation_results = subtitle_validator.validate(request.subtitles, strict=strict)

        logger.info(
            f"Subtitle validation completed: {'PASS' if validation_results['valid'] else 'FAIL'} "
            f"({len(validation_results['violations'])} violations, {len(validation_results['warnings'])} warnings)"
        )
        return validation_results

    except SubtitleValidationError as e:
        # Return validation errors as 400 with details
        return {"valid": False, "violations": e.violations, "warnings": [], "error": str(e)}
    except Exception as e:
        logger.error(f"Failed to validate subtitles: {e}")
        raise HTTPException(status_code=500, detail=f"Validation failed: {e!s}") from e


@app.post("/auto-fix")
async def auto_fix_subtitles(
    request: SubtitleValidationRequest,
    token: str = Depends(oauth2_scheme)
) -> dict:
    """Automatically fix common subtitle issues.

    Applies automatic fixes for:
    - Re-indexing subtitles
    - Sorting by start time
    - Fixing overlaps
    - Ensuring minimum duration

    Returns fixed subtitles and a report of applied fixes.
    """
    try:
        fixed_subtitles, fix_report = subtitle_validator.auto_fix(
            request.subtitles, in_place=False
        )

        # Validate fixed subtitles
        validation_results = subtitle_validator.validate(fixed_subtitles, strict=False)

        logger.info(
            f"Auto-fix applied {fix_report['fixes_applied']} fixes to "
            f"{fix_report['subtitles_processed']} subtitles"
        )

        return {
            "subtitles": [subtitle.model_dump() for subtitle in fixed_subtitles],
            "fix_report": fix_report,
            "validation_after_fix": validation_results,
        }

    except Exception as e:
        logger.error(f"Failed to auto-fix subtitles: {e}")
        raise HTTPException(status_code=500, detail=f"Auto-fix failed: {e!s}") from e


@app.post("/batch-process")
async def batch_process_subtitles(
    requests: list[SubtitleRequest],
    token: str = Depends(oauth2_scheme)
) -> list[SubtitleResponse]:
    """Process multiple subtitle generation requests in batch.

    Useful for processing multiple slides or presentation segments
    simultaneously for better performance.
    """
    try:
        if len(requests) > 50:  # Reasonable batch limit
            raise HTTPException(status_code=400, detail="Batch size too large (max 50 requests)")

        logger.info(f"Processing batch of {len(requests)} subtitle requests")

        results = []
        for request in requests:
            try:
                result = await generate_subtitles(request, token)
                results.append(result)
            except Exception as e:
                logger.error(f"Failed to process batch item: {e}")
                # Add error response for this item
                results.append(SubtitleResponse(
                    subtitles=[],
                    total_duration=0.0,
                    format="srt",
                    processing_time=0.0,
                ))

        logger.info(f"Completed batch processing of {len(results)} subtitle requests")
        return results

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to process batch subtitles: {e}")
        raise HTTPException(status_code=500, detail=f"Batch processing failed: {e!s}") from e


@app.get("/formats")
async def get_supported_formats(token: str = Depends(oauth2_scheme)) -> dict:
    """Get list of supported subtitle formats and their capabilities."""
    return {
        "formats": [
            {
                "name": "SRT",
                "extension": "srt",
                "mime_type": "text/plain",
                "description": "SubRip subtitle format with timing",
                "supports_styling": False,
                "supports_positions": False,
            },
            {
                "name": "WebVTT",
                "extension": "vtt",
                "mime_type": "text/vtt",
                "description": "Web Video Text Tracks format",
                "supports_styling": True,
                "supports_positions": True,
            },
        ],
        "default_format": "srt",
        "max_text_length": config.get("subtitle_max_chars_per_line", 50),
        "max_lines_per_subtitle": config.get("subtitle_max_lines_per_subtitle", 2),
    }


@app.get("/config")
async def get_subtitle_config(token: str = Depends(oauth2_scheme)) -> dict:
    """Get current subtitle generation configuration."""
    return {
        "max_chars_per_line": subtitle_generator.max_chars_per_line,
        "max_lines_per_subtitle": subtitle_generator.max_lines_per_subtitle,
        "min_subtitle_duration": subtitle_generator.min_subtitle_duration,
        "max_subtitle_duration": subtitle_generator.max_subtitle_duration,
        "stt_provider": subtitle_generator.stt_provider,
        "speaking_rate_wpm": config.get("speaking_rate_wpm", 150),
    }


if __name__ == "__main__":
    try:
        import uvicorn
    except ImportError as e:
        raise RuntimeError("uvicorn must be installed to run this service.") from e
    uvicorn.run(app, host="0.0.0.0", port=8004)
