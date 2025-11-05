"""Narration orchestrator for managing the complete presentation processing pipeline."""

import asyncio
import time
from datetime import UTC, datetime, timedelta
from enum import Enum
from pathlib import Path
from typing import Any

from pydantic import BaseModel

from services.queue import QueueManager
from shared.config import config
from shared.models import (
    ContextualRefinementRequest,
    ExportFormat,
    ExportResponse,
    ImageAnalysisRequest,
    PresentationContext,
    PresentationRequest,
    RefinedScript,
    SlideContent,
    SubtitleEntry,
    TTSRequest,
    TTSResponse,
)
from shared.utils import Cache, ensure_directory, generate_hash, setup_logging

logger = setup_logging("narration-orchestrator")


class JobStatus(str, Enum):
    """Status of narration processing jobs."""
    QUEUED = "queued"
    PROCESSING = "processing"
    REFINING = "refining"
    SYNTHESIZING = "synthesizing"
    GENERATING_SUBTITLES = "generating_subtitles"
    EXPORTING = "exporting"
    COMPLETED = "completed"
    FAILED = "failed"


class ProcessingStep(str, Enum):
    """Individual processing steps in the pipeline."""
    EXTRACTION = "extracting"
    REFINEMENT = "refining"
    SYNTHESIS = "synthesizing"
    SUBTITLE_GENERATION = "generating_subtitles"
    EXPORT = "exporting"


class ProgressUpdate(BaseModel):
    """Real-time progress update for WebSocket clients."""
    job_id: str
    status: JobStatus
    current_step: ProcessingStep
    current_slide: int
    total_slides: int
    progress: float  # 0.0 to 1.0
    estimated_time_remaining: float
    message: str | None = None
    error: str | None = None
    slide_result: dict[str, Any] | None = None


class NarrationOrchestrator:
    """Orchestrates the complete narration processing pipeline."""

    def __init__(self):
        configured_root = Path(config.get("media_root", "./media"))
        self.media_root = self._initialize_media_root(configured_root)

        # Initialize queue manager for background processing
        self.queue_manager = QueueManager()

        # Cache for storing job status and progress
        self.cache = Cache()

        # Import services dynamically to avoid circular imports
        self._ai_refinement_service = None
        self._tts_service = None
        self._subtitle_service = None
        self._image_analysis_service = None

    def _initialize_media_root(self, configured_root: Path) -> Path:
        """Ensure media root is writable, falling back to a local directory if needed."""
        try:
            ensure_directory(str(configured_root))
            return configured_root
        except PermissionError:
            fallback_root = Path("./media")
            logger.warning(
                "Unable to create media directory at %s due to permissions; "
                "falling back to %s",
                configured_root,
                fallback_root,
            )
            ensure_directory(str(fallback_root))
            return fallback_root

    @property
    def ai_refinement_service(self):
        """Lazy load AI refinement service."""
        if self._ai_refinement_service is None:
            from services.ai_refinement.service import TextRefinementService
            self._ai_refinement_service = TextRefinementService(logger)
        return self._ai_refinement_service

    @ai_refinement_service.setter
    def ai_refinement_service(self, service):
        self._ai_refinement_service = service

    @ai_refinement_service.deleter
    def ai_refinement_service(self):
        self._ai_refinement_service = None

    @property
    def tts_service(self):
        """Lazy load TTS service."""
        if self._tts_service is None:
            from services.tts_service.service import TTSService
            self._tts_service = TTSService()
        return self._tts_service

    @tts_service.setter
    def tts_service(self, service):
        self._tts_service = service

    @tts_service.deleter
    def tts_service(self):
        self._tts_service = None

    @property
    def image_analysis_service(self):
        """Lazy load image analysis service."""
        if self._image_analysis_service is None:
            from services.image_analysis.service import ImageAnalysisService

            self._image_analysis_service = ImageAnalysisService()
        return self._image_analysis_service

    @image_analysis_service.setter
    def image_analysis_service(self, service):
        self._image_analysis_service = service

    @image_analysis_service.deleter
    def image_analysis_service(self):
        self._image_analysis_service = None

    async def process_presentation(self, request: PresentationRequest) -> str:
        """Start processing a presentation and return job ID."""
        job_id = generate_hash(f"presentation_{len(request.slides)}_{int(time.time())}")

        # Create job metadata
        job_data = {
            "job_id": job_id,
            "status": JobStatus.QUEUED,
            "total_slides": len(request.slides),
            "current_slide": 0,
            "progress": 0.0,
            "started_at": datetime.now(UTC).isoformat(),
            "request": request.model_dump(),
        }

        # Store job in cache
        self.cache.set(f"job:{job_id}", job_data, ttl=3600)

        # Enqueue job for background processing
        await self.queue_manager.enqueue("narration_jobs", {
            "job_id": job_id,
            "action": "process_presentation",
            "data": job_data,
        })

        # Start background processing task
        asyncio.create_task(self._process_presentation_background(job_id, request))

        logger.info(f"Queued narration job {job_id} for {len(request.slides)} slides")
        return job_id

    async def process_slide(
        self,
        job_id: str,
        slide: SlideContent,
        slide_number: int,
        presentation: PresentationRequest | None = None,
        context_overrides: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Process a single slide through the complete pipeline."""
        slide_start_time = time.time()

        try:
            # Update progress
            await self._update_progress(job_id, ProcessingStep.EXTRACTION, slide_number,
                                       message=f"Processing slide {slide_number}")

            # Step 1: AI Refinement
            await self._update_progress(job_id, ProcessingStep.REFINEMENT, slide_number,
                                       message=f"Refining content for slide {slide_number}")

            refined_content, contextual_metadata = await self._refine_slide_content(
                slide,
                slide_number,
                presentation,
                context_overrides,
            )

            # Step 2: TTS Synthesis
            await self._update_progress(job_id, ProcessingStep.SYNTHESIS, slide_number,
                                       message=f"Generating audio for slide {slide_number}")

            audio_result = await self._synthesize_slide_audio(refined_content, slide_number)

            # Step 3: Subtitle Generation
            await self._update_progress(job_id, ProcessingStep.SUBTITLE_GENERATION, slide_number,
                                       message=f"Creating subtitles for slide {slide_number}")

            subtitles = await self._generate_slide_subtitles(refined_content, audio_result)

            processing_time = time.time() - slide_start_time

            result: dict[str, Any] = {
                "slide_number": slide_number,
                "slide_id": slide.slide_id,
                "original_content": slide.content,
                "refined_content": refined_content,
                "audio_result": audio_result,
                "subtitles": subtitles,
                "processing_time": processing_time,
                "status": "completed",
            }
            if contextual_metadata:
                result["contextual_metadata"] = contextual_metadata

            return result

        except Exception as e:
            logger.error(f"Failed to process slide {slide_number}: {e}")
            return {
                "slide_number": slide_number,
                "slide_id": slide.slide_id,
                "status": "failed",
                "error": str(e),
            }

    async def _process_presentation_background(self, job_id: str, request: PresentationRequest):
        """Background task to process the entire presentation."""
        try:
            # Update job status to processing
            await self._update_job_status(job_id, JobStatus.PROCESSING)

            total_slides = len(request.slides)
            processed_slides = []

            # Process each slide
            for i, slide in enumerate(request.slides):
                slide_result = await self.process_slide(job_id, slide, i + 1, request)
                processed_slides.append(slide_result)

                # Update overall progress
                progress = (i + 1) / total_slides
                await self._update_progress(
                    job_id,
                    ProcessingStep.SYNTHESIS,
                    i + 1,
                    progress=progress,
                    message=f"Completed {i + 1}/{total_slides} slides",
                    slide_result=slide_result,
                )

            # Export final presentation
            await self._update_progress(job_id, ProcessingStep.EXPORT, total_slides,
                                       message="Exporting final presentation")

            export_result = await self._export_presentation(job_id, processed_slides, request)

            # Mark job as completed
            await self._update_job_status(job_id, JobStatus.COMPLETED)
            await self._update_progress(job_id, ProcessingStep.EXPORT, total_slides,
                                       progress=1.0, message="Processing completed")

            logger.info(f"Completed narration job {job_id} in {time.time():.2f}s")

        except Exception as e:
            logger.error(f"Failed to process presentation job {job_id}: {e}")
            await self._update_job_status(job_id, JobStatus.FAILED)
            await self._update_progress(job_id, ProcessingStep.EXPORT, 0,
                                       error=str(e), message="Processing failed")

    async def _refine_slide_content(
        self,
        slide: SlideContent,
        slide_number: int,
        presentation: PresentationRequest | None,
        context_overrides: dict[str, Any] | None,
    ) -> tuple[str, dict[str, Any] | None]:
        """Refine slide content using AI refinement service."""
        from shared.models import TextRefinementRequest, TextRefinementType

        refinement_request = TextRefinementRequest(
            text=slide.content,
            refinement_type=TextRefinementType.CLARITY,
            target_audience="presentation audience",
            tone="professional and engaging",
        )

        response = await self.ai_refinement_service.refine_text(refinement_request)
        refined_text = response.refined_text

        if slide.images:
            await self._ensure_image_analysis(slide, presentation)

        contextual_metadata: dict[str, Any] | None = None
        needs_context = presentation is not None or bool(slide.images) or bool(slide.notes)

        if needs_context and hasattr(self.ai_refinement_service, "refine_with_context"):
            presentation_context = self._build_presentation_context(
                slide_number,
                presentation,
                context_overrides,
            )
            contextual_request = ContextualRefinementRequest(
                slide_text=refined_text,
                slide_title=slide.title,
                slide_layout=slide.layout,
                slide_notes=slide.notes,
                images=slide.images or [],
                presentation_context=presentation_context,
            )

            contextual_result: RefinedScript = await self.ai_refinement_service.refine_with_context(
                contextual_request
            )
            refined_text = contextual_result.text
            contextual_metadata = {
                "highlights": contextual_result.highlights,
                "image_references": contextual_result.image_references,
                "transitions": contextual_result.transitions,
                "confidence": contextual_result.confidence,
            }

        return refined_text, contextual_metadata

    async def _ensure_image_analysis(
        self,
        slide: SlideContent,
        presentation: PresentationRequest | None,
    ) -> None:
        """Ensure slide images have analysis metadata before contextual refinement."""
        missing_images = [image for image in slide.images if image.analysis is None]
        if not missing_images:
            return

        presentation_id = None
        if presentation and presentation.metadata:
            presentation_id = presentation.metadata.get("presentation_id") or presentation.metadata.get("id")

        metadata = {
            "slide_title": slide.title,
            "slide_notes": slide.notes,
            "presentation_metadata": presentation.metadata if presentation else {},
            "topic_keywords": presentation.metadata.get("keywords") if presentation and presentation.metadata else [],
        }

        request = ImageAnalysisRequest(
            presentation_id=presentation_id,
            slide_id=slide.slide_id,
            images=missing_images,
            metadata=metadata,
        )

        response = await self.image_analysis_service.analyze_slide_images(request)
        analysis_map = {result.image_id: result.analysis for result in response.results}

        for image in slide.images:
            if image.analysis is None and image.image_id in analysis_map:
                image.analysis = analysis_map[image.image_id]

    def _build_presentation_context(
        self,
        slide_number: int,
        presentation: PresentationRequest | None,
        context_overrides: dict[str, Any] | None,
    ) -> PresentationContext:
        """Construct contextual metadata for the current slide."""
        overrides = context_overrides or {}
        if presentation is None:
            return PresentationContext(
                presentation_title=overrides.get("presentation_title"),
                section_title=overrides.get("section_title"),
                audience=overrides.get("audience"),
                current_slide=slide_number,
                total_slides=overrides.get("total_slides"),
                previous_slide_summary=overrides.get("previous_slide_summary"),
                next_slide_summary=overrides.get("next_slide_summary"),
                topic_keywords=self._normalize_keywords(overrides.get("topic_keywords")),
            )

        total_slides = len(presentation.slides)
        metadata = presentation.metadata or {}

        previous_slide = (
            presentation.slides[slide_number - 2] if slide_number > 1 and total_slides >= slide_number else None
        )
        next_slide = (
            presentation.slides[slide_number] if slide_number < total_slides else None
        )

        return PresentationContext(
            presentation_title=metadata.get("title"),
            section_title=metadata.get("section"),
            audience=metadata.get("audience"),
            topic_keywords=self._extract_keywords(metadata),
            current_slide=slide_number,
            total_slides=total_slides,
            previous_slide_summary=self._summarize_slide(previous_slide),
            next_slide_summary=self._summarize_slide(next_slide),
        )

    def _summarize_slide(self, slide: SlideContent | None) -> str | None:
        """Generate a lightweight summary from slide content or notes."""
        if slide is None:
            return None

        source_text = slide.notes or slide.content or ""
        normalized = " ".join(source_text.split())
        if not normalized:
            return None

        max_words = 40
        words = normalized.split()
        summary = " ".join(words[:max_words])
        if len(words) > max_words:
            summary = f"{summary}..."
        return summary

    @staticmethod
    def _normalize_keywords(raw: Any) -> list[str]:
        """Normalize keyword overrides into a list of strings."""
        if raw is None:
            return []
        if isinstance(raw, list):
            return [str(keyword) for keyword in raw if keyword]
        if isinstance(raw, str):
            return [keyword.strip() for keyword in raw.split(",") if keyword.strip()]
        return []

    @staticmethod
    def _extract_keywords(metadata: dict[str, Any]) -> list[str]:
        """Extract topic keywords from presentation metadata."""
        if not metadata:
            return []
        keywords = metadata.get("keywords")
        if isinstance(keywords, list):
            return [str(keyword) for keyword in keywords if keyword]
        if isinstance(keywords, str):
            return [keyword.strip() for keyword in keywords.split(",") if keyword.strip()]
        return []

    async def _synthesize_slide_audio(self, text: str, slide_number: int) -> TTSResponse:
        """Synthesize audio for refined text using TTS service."""
        tts_request = TTSRequest(
            text=text,
            voice="en-US-AriaNeural",
            speed=1.0,
            output_format="wav",
        )

        return await self.tts_service.synthesize_speech(tts_request)

    async def _generate_slide_subtitles(self, text: str, audio_result: TTSResponse) -> list[SubtitleEntry]:
        """Generate subtitles synchronized with audio timing."""
        # Simple subtitle generation - split text into chunks
        words = text.split()
        chunk_size = 10
        chunks = [" ".join(words[i:i + chunk_size]) for i in range(0, len(words), chunk_size)]

        subtitles = []
        duration = audio_result.duration if audio_result else 5.0
        chunk_duration = duration / len(chunks) if chunks else duration

        for i, chunk in enumerate(chunks):
            start_time = i * chunk_duration
            end_time = (i + 1) * chunk_duration

            subtitles.append(SubtitleEntry(
                index=i + 1,
                start_time=start_time,
                end_time=end_time,
                text=chunk,
            ))

        return subtitles

    async def _export_presentation(self, job_id: str, processed_slides: list[dict],
                                 request: PresentationRequest) -> ExportResponse:
        """Export the final presentation with audio and subtitles."""
        export_dir = self.media_root / job_id
        export_dir.mkdir(parents=True, exist_ok=True)

        # Create export manifest
        export_data = {
            "job_id": job_id,
            "total_slides": len(processed_slides),
            "processed_at": datetime.now(UTC).isoformat(),
            "slides": processed_slides,
        }

        # Save manifest
        manifest_path = export_dir / "manifest.json"
        import json
        manifest_path.write_text(json.dumps(export_data, indent=2), encoding="utf-8")

        # Create export response
        export_id = generate_hash(f"{job_id}_export_{int(time.time())}")

        now = datetime.now(UTC)
        return ExportResponse(
            export_id=export_id,
            download_url=f"/media/{job_id}/presentation_with_narration.pptx",
            file_size=manifest_path.stat().st_size,
            export_format=ExportFormat.PPTX,
            created_at=now,
            expires_at=now + timedelta(hours=24),
        )

    async def _update_job_status(self, job_id: str, status: JobStatus):
        """Update the overall job status."""
        job_data = self.cache.get(f"job:{job_id}")
        if job_data:
            job_data["status"] = status
            job_data["updated_at"] = datetime.now(UTC).isoformat()
            self.cache.set(f"job:{job_id}", job_data, ttl=3600)

    async def _update_progress(
        self,
        job_id: str,
        step: ProcessingStep,
        current_slide: int,
        progress: float | None = None,
        message: str | None = None,
        error: str | None = None,
        slide_result: dict[str, Any] | None = None,
    ):
        """Update progress for a processing job."""
        job_data = self.cache.get(f"job:{job_id}")
        if not job_data:
            return

        total_slides = job_data.get("total_slides", 1)

        # Calculate progress if not provided
        if progress is None:
            progress = current_slide / total_slides

        # Estimate time remaining (simple calculation)
        elapsed = time.time() - time.mktime(datetime.fromisoformat(job_data["started_at"]).timetuple())
        if progress > 0:
            estimated_total = elapsed / progress
            time_remaining = estimated_total - elapsed
        else:
            time_remaining = 0.0

        progress_update = ProgressUpdate(
            job_id=job_id,
            status=JobStatus.PROCESSING,
            current_step=step,
            current_slide=current_slide,
            total_slides=total_slides,
            progress=progress,
            estimated_time_remaining=time_remaining,
            message=message,
            error=error,
            slide_result=slide_result,
        )

        # Store progress update in cache
        self.cache.set(f"progress:{job_id}", progress_update.model_dump(), ttl=3600)

        # Send to WebSocket clients (if WebSocket manager is available)
        await self._send_progress_update(progress_update)

    async def _send_progress_update(self, progress_update: ProgressUpdate):
        """Send progress update to WebSocket clients."""
        try:
            from services.websocket_progress import websocket_manager
        except ImportError:
            return

        await websocket_manager.send_progress_update(
            progress_update.job_id,
            progress_update.model_dump(),
        )

    async def get_job_status(self, job_id: str) -> dict[str, Any] | None:
        """Get the current status of a processing job."""
        job_data = self.cache.get(f"job:{job_id}")
        if not job_data:
            return None

        # Include latest progress if available
        progress_data = self.cache.get(f"progress:{job_id}")
        if progress_data:
            job_data["progress"] = progress_data

        return job_data

    async def cancel_job(self, job_id: str) -> bool:
        """Cancel a processing job."""
        job_data = self.cache.get(f"job:{job_id}")
        if not job_data:
            return False

        if job_data["status"] in [JobStatus.QUEUED, JobStatus.PROCESSING]:
            await self._update_job_status(job_id, JobStatus.FAILED)
            await self._update_progress(job_id, ProcessingStep.EXPORT, 0,
                                       message="Job cancelled by user")
            return True

        return False
