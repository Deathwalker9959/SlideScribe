"""Narration orchestrator for managing the complete presentation processing pipeline."""

import asyncio
import json
import shutil
import time
import wave
from datetime import UTC, datetime, timedelta
from enum import Enum
from pathlib import Path
from typing import Any

from pydantic import BaseModel

from services.queue import QueueManager
from services.voice_profiles.manager import VoiceProfileManager
from shared.config import config
from shared.models import (
    AudioCombineRequest,
    AudioSegment as AudioSegmentModel,
    AudioTransition,
    AudioTransitionRequest,
    AudioExportRequest,
    ContextualRefinementRequest,
    ExportFormat,
    ExportResponse,
    ImageAnalysis,
    ImageAnalysisRequest,
    ImageData,
    PresentationContext,
    PresentationRequest,
    RefinedScript,
    SlideContent,
    SubtitleEntry,
    TTSRequest,
    TTSResponse,
    TextRefinementResponse,
)
from shared.utils import Cache, ensure_directory, generate_hash, setup_logging

logger = setup_logging("narration-orchestrator")

SUPPORTED_LANGUAGES = {"en-US", "el-GR"}
DEFAULT_VOICE_BY_LANGUAGE = {
    "en-US": "en-US-AriaNeural",
    "el-GR": "el-GR-AthinaNeural",
}
DEFAULT_PROVIDER = "azure"


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
        logger.info("Queue manager initialized")

        # Cache for storing job status and progress
        self.cache = Cache()

        # Import services dynamically to avoid circular imports
        self._ai_refinement_service = None
        self._tts_service = None
        self._subtitle_service = None
        self._image_analysis_service = None
        self._audio_processor = None
        self._voice_profile_manager = None

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

    @property
    def audio_processor(self):
        """Lazy load audio processor service."""
        if self._audio_processor is None:
            from services.audio_processing.service import AudioProcessor

            self._audio_processor = AudioProcessor()
        return self._audio_processor

    @audio_processor.setter
    def audio_processor(self, service):
        self._audio_processor = service

    @audio_processor.deleter
    def audio_processor(self):
        self._audio_processor = None

    @property
    def voice_profile_manager(self) -> VoiceProfileManager:
        if self._voice_profile_manager is None:
            self._voice_profile_manager = VoiceProfileManager()
        return self._voice_profile_manager

    @voice_profile_manager.setter
    def voice_profile_manager(self, manager):
        self._voice_profile_manager = manager

    @voice_profile_manager.deleter
    def voice_profile_manager(self):
        self._voice_profile_manager = None

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
            "request": self._serialize_metadata(request.model_dump()),
        }

        # Store job in cache
        self.cache.set(f"job:{job_id}", job_data, ttl=3600)

        # Enqueue job for background processing
        import json
        job_payload = {
            "job_id": job_id,
            "action": "process_presentation",
            "data": job_data,
        }
        self.queue_manager.enqueue("narration_jobs", json.dumps(job_payload))

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
        tts_options: dict[str, Any] | None = None,
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

            audio_result, audio_file_path = await self._synthesize_slide_audio(
                job_id,
                refined_content,
                slide_number,
                tts_options or {},
            )

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
                "audio_result": audio_result.model_dump() if audio_result else None,
                "audio_file_path": audio_file_path,
                "subtitles": [subtitle.model_dump() for subtitle in subtitles] if subtitles else [],
                "processing_time": processing_time,
                "status": "completed",
            }
            if contextual_metadata:
                result["contextual_metadata"] = self._serialize_metadata(contextual_metadata)

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
            tts_options = await self._resolve_tts_options(request)

            # Process each slide
            for i, slide in enumerate(request.slides):
                slide_result = await self.process_slide(job_id, slide, i + 1, request, tts_options=tts_options)
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
            audio_segments: list[AudioSegmentModel] = []
            for slide_result in processed_slides:
                audio_path = slide_result.get("audio_file_path")
                audio_result_data = slide_result.get("audio_result")
                if audio_result_data and isinstance(audio_result_data, dict):
                    duration = audio_result_data.get("duration", slide_result.get("processing_time", 5.0))
                else:
                    duration = slide_result.get("processing_time") or 5.0
                if audio_path:
                    audio_segments.append(
                        AudioSegmentModel(
                            slide_id=slide_result.get("slide_id", ""),
                            file_path=str(audio_path),
                            duration=float(duration),
                        )
                    )

            audio_manifest: dict[str, Any] | None = None
            if audio_segments:
                combine_request = AudioCombineRequest(
                    job_id=job_id,
                    presentation_id=request.metadata.get("presentation_id", job_id) if request.metadata else job_id,
                    segments=audio_segments,
                    output_format="wav",
                )
                try:
                    combine_response = await self.audio_processor.combine_segments(combine_request)
                    audio_manifest = combine_response.model_dump()
                    audio_manifest["combined_output_path"] = audio_manifest.get("output_path")

                    timeline_entries = audio_manifest.get("timeline") or []
                    timeline_map = {
                        entry.get("slide_id"): entry
                        for entry in timeline_entries
                        if isinstance(entry, dict) and entry.get("slide_id")
                    }
                    slides_with_audio_meta: list[tuple[dict[str, Any], dict[str, Any]]] = []
                    for slide_result in processed_slides:
                        slide_id = slide_result.get("slide_id")
                        if slide_id and slide_id in timeline_map:
                            slide_audio = slide_result.setdefault("audio_metadata", {})
                            slide_audio["timeline"] = timeline_map[slide_id]
                            slides_with_audio_meta.append((slide_result, slide_audio))

                    await self._update_progress(
                        job_id,
                        ProcessingStep.EXPORT,
                        total_slides,
                        message="Audio segments combined",
                        slide_result={"audio": audio_manifest},
                    )

                    transitions: list[AudioTransition] = []
                    if len(audio_segments) > 1:
                        transitions = [
                            AudioTransition(
                                from_slide=audio_segments[i].slide_id,
                                to_slide=audio_segments[i + 1].slide_id,
                                duration=1.0,
                            )
                            for i in range(len(audio_segments) - 1)
                        ]
                        transition_response = await self.audio_processor.apply_transitions(
                            AudioTransitionRequest(
                                job_id=job_id,
                                combined_audio_path=combine_response.output_path,
                                transitions=transitions,
                            )
                        )
                        transition_data = transition_response.model_dump()
                        audio_manifest["transition_output"] = transition_data
                        audio_manifest["output_path"] = transition_response.output_path
                        audio_manifest["output_peak_dbfs"] = transition_response.output_peak_dbfs
                        audio_manifest["output_loudness_dbfs"] = transition_response.output_loudness_dbfs

                        await self._update_progress(
                            job_id,
                            ProcessingStep.EXPORT,
                            total_slides,
                            message="Audio transitions applied",
                            slide_result={"audio": audio_manifest},
                        )

                    audio_manifest["transitions"] = [transition.model_dump() for transition in transitions]
                    await self._update_progress(
                        job_id,
                        ProcessingStep.EXPORT,
                        total_slides,
                        message="Audio mix ready",
                        slide_result={"audio": audio_manifest},
                    )

                    exports: list[dict[str, Any]] = []
                    for export_format in ("mp3", "mp4"):
                        try:
                            export_response = await self.audio_processor.export_mix(
                                AudioExportRequest(
                                    job_id=job_id,
                                    format=export_format,
                                    include_transitions=bool(transitions),
                                )
                            )
                            exports.append(export_response.model_dump())
                        except Exception as export_exc:  # pragma: no cover - best-effort conversions
                            logger.warning(
                                "Audio export (%s) failed for job %s: %s",
                                export_format,
                                job_id,
                                export_exc,
                            )
                    if exports:
                        audio_manifest["exports"] = exports
                        for slide_result, slide_audio in slides_with_audio_meta:
                            slide_audio["exports"] = exports
                        for slide_result in processed_slides:
                            if not slide_result.get("audio_file_path") and not slide_result.get("audio_result"):
                                continue
                            slide_audio = slide_result.setdefault("audio_metadata", {})
                            slide_audio.setdefault("timeline", timeline_map.get(slide_result.get("slide_id"), {}))
                            slide_audio["exports"] = exports
                except Exception as exc:
                    logger.warning("Audio processing failed for job %s: %s", job_id, exc)

            await self._update_progress(job_id, ProcessingStep.EXPORT, total_slides,
                                       message="Exporting final presentation")

            export_result = await self._export_presentation(job_id, processed_slides, request, audio_manifest)

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

        refined_text = slide.content
        refine_response: TextRefinementResponse | None = None

        if slide.images:
            await self._ensure_image_analysis(slide, presentation)

        contextual_metadata: dict[str, Any] | None = None
        context_enabled = config.get_pipeline_value("pipelines.contextual_refinement.enabled", True)
        images_with_analysis = any(image.analysis is not None for image in slide.images)
        presentation_has_metadata = bool(presentation and presentation.metadata)
        should_use_context = (
            context_enabled
            and hasattr(self.ai_refinement_service, "refine_with_context")
            and (
                images_with_analysis
                or bool(slide.notes)
                or presentation_has_metadata
            )
        )

        if should_use_context:
            refinement_request = TextRefinementRequest(
                text=refined_text,
                refinement_type=TextRefinementType.CLARITY,
                target_audience="presentation audience",
                tone="professional and engaging",
            )
            refine_response = await self.ai_refinement_service.refine_text(refinement_request)
            refined_text = refine_response.refined_text

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

            try:
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
            except Exception as exc:
                logger.warning(
                    "Contextual refinement failed for slide %s: %s. Falling back to standard refinement.",
                    slide.slide_id,
                    exc,
                )
                should_use_context = False

        if not should_use_context:
            if refine_response is None:
                refinement_request = TextRefinementRequest(
                    text=refined_text,
                    refinement_type=TextRefinementType.CLARITY,
                    target_audience="presentation audience",
                    tone="professional and engaging",
                )
                refine_response = await self.ai_refinement_service.refine_text(refinement_request)
            refined_text = refine_response.refined_text

        return refined_text, contextual_metadata

    async def _resolve_tts_options(self, request: PresentationRequest) -> dict[str, Any]:
        settings = request.settings or {}
        metadata = request.metadata or {}

        owner_id = metadata.get("user_id") or metadata.get("owner_id") or metadata.get("account_id")
        presentation_id = (
            metadata.get("presentation_id")
            or metadata.get("deck_id")
            or metadata.get("id")
        )

        resolved: dict[str, Any] = {
            "provider": DEFAULT_PROVIDER,
            "voice": DEFAULT_VOICE_BY_LANGUAGE["en-US"],
            "language": "en-US",
            "speed": 1.0,
            "pitch": 0.0,
            "volume": 1.0,
            "tone": "professional",
            "presentation_id": presentation_id,
            "owner_id": owner_id,
        }

        if owner_id or presentation_id:
            preferred = await self.voice_profile_manager.get_preferred_settings(owner_id, presentation_id)
            if preferred:
                resolved.update(preferred)

        request_overrides = {
            "provider": settings.get("provider") or settings.get("ttsProvider"),
            "voice": settings.get("voice") or settings.get("voiceName"),
            "language": settings.get("language"),
            "speed": settings.get("speed"),
            "pitch": settings.get("pitch"),
            "volume": settings.get("volume"),
            "tone": settings.get("tone"),
        }
        for key, value in request_overrides.items():
            if value is not None:
                resolved[key] = value

        provider_value = (resolved.get("provider") or DEFAULT_PROVIDER).lower()
        if provider_value not in {"azure", "openai"}:
            provider_value = DEFAULT_PROVIDER
        resolved["provider"] = provider_value

        voice_value = resolved.get("voice")
        language_value = resolved.get("language")
        language_value = self._normalise_language(language_value, voice_value)
        resolved["language"] = language_value

        if provider_value == "azure":
            default_voice = DEFAULT_VOICE_BY_LANGUAGE.get(language_value)
            if default_voice and (not voice_value or language_value not in (voice_value or "")):
                resolved["voice"] = default_voice
        elif provider_value == "openai" and not voice_value:
            resolved["voice"] = "alloy"

        resolved["speed"] = self._clamp_float(resolved.get("speed"), default=1.0, minimum=0.5, maximum=2.0)
        resolved["pitch"] = self._clamp_float(resolved.get("pitch"), default=0.0, minimum=-50.0, maximum=50.0)
        resolved["volume"] = self._clamp_float(resolved.get("volume"), default=1.0, minimum=0.1, maximum=2.0)

        if owner_id or presentation_id:
            await self.voice_profile_manager.set_preferred_settings(
                owner_id,
                presentation_id,
                resolved,
            )

        return resolved

    @staticmethod
    def _clamp_float(value: Any, *, default: float, minimum: float, maximum: float) -> float:
        try:
            numeric = float(value)
        except (TypeError, ValueError):
            numeric = default
        return max(minimum, min(maximum, numeric))

    @staticmethod
    def _derive_language_from_voice(voice: str) -> str:
        parts = voice.split("-")
        if len(parts) >= 2:
            return "-".join(parts[:2])
        return "en-US"

    @staticmethod
    def _normalise_language(language: str | None, voice: str | None) -> str:
        if language and language in SUPPORTED_LANGUAGES:
            return language
        derived = NarrationOrchestrator._derive_language_from_voice(voice or "")
        if derived in SUPPORTED_LANGUAGES:
            return derived
        return "en-US"

    async def _ensure_image_analysis(
        self,
        slide: SlideContent,
        presentation: PresentationRequest | None,
    ) -> None:
        """Ensure slide images have analysis metadata before contextual refinement."""
        if not config.get_pipeline_value("pipelines.contextual_refinement.enabled", True):
            return
        if not config.get_pipeline_value("pipelines.contextual_refinement.use_image_analysis", True):
            return

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
        placeholder_applied = False

        for image in slide.images:
            if image.analysis is not None:
                continue
            if image.image_id in analysis_map:
                image.analysis = analysis_map[image.image_id]
                continue
            image.analysis = self._build_placeholder_image_analysis(image, slide, presentation)
            placeholder_applied = True

        if placeholder_applied:
            logger.debug(
                "Applied placeholder image analysis for slide %s (presentation: %s)",
                slide.slide_id,
                presentation_id or "unknown",
            )

    @staticmethod
    def _build_placeholder_image_analysis(
        image: ImageData,
        slide: SlideContent,
        presentation: PresentationRequest | None,
    ) -> ImageAnalysis:
        """Build a lightweight placeholder analysis when provider results are missing."""
        caption_candidates = [
            image.description,
            image.alt_text,
            (slide.title or "").strip(),
        ]
        caption = next((candidate.strip() for candidate in caption_candidates if candidate and candidate.strip()), None)
        if not caption:
            caption = "Image requires manual review."

        base_tags = [label for label in image.labels if label]
        if not base_tags and slide.title:
            base_tags.append(slide.title)

        presentation_topic = None
        if presentation and presentation.metadata:
            keywords = presentation.metadata.get("keywords") or presentation.metadata.get("topic_keywords")
            if isinstance(keywords, list) and keywords:
                presentation_topic = keywords[0]
        if presentation_topic and presentation_topic not in base_tags:
            base_tags.append(presentation_topic)

        tokens = [token for token in (image.labels or []) + (image.detected_objects or []) if token]
        chart_keywords = {"chart", "graph", "diagram", "plot", "figure"}
        has_chart_visual = any(
            any(keyword in token.lower() for keyword in chart_keywords) for token in tokens
        )

        if has_chart_visual:
            callouts = ["Narration cue: acknowledge the chart and invite the audience to review the visual."]
        else:
            callouts = ["Narration cue: mention the visual briefly and guide the audience to the slide content."]

        raw_metadata = {
            "placeholder": True,
            "reason": "analysis_unavailable",
            "original_description": image.description,
            "alt_text": image.alt_text,
            "labels": image.labels,
            "detected_objects": image.detected_objects,
        }

        return ImageAnalysis(
            caption=caption,
            confidence=0.05,
            tags=base_tags,
            objects=image.detected_objects,
            text_snippets=[],
            chart_insights=[],
            table_insights=[],
            data_points=[],
            callouts=callouts,
            dominant_colors=image.dominant_colors,
            raw_metadata=raw_metadata,
        )

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

    @staticmethod
    def _write_silent_wav(path: Path, duration_seconds: float) -> None:
        sample_rate = 16000
        total_frames = int(sample_rate * duration_seconds)
        ensure_directory(str(path.parent))
        with wave.open(str(path), "w") as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(sample_rate)
            wav_file.writeframes(b"\x00\x00" * total_frames)

    async def _synthesize_slide_audio(
        self,
        job_id: str,
        text: str,
        slide_number: int,
        tts_options: dict[str, Any],
    ) -> tuple[TTSResponse, str]:
        """Synthesize audio for refined text using TTS service and persist placeholder audio."""
        voice = tts_options.get("voice", "en-US-AriaNeural")
        language = tts_options.get("language") or self._derive_language_from_voice(voice)
        speed = float(tts_options.get("speed", 1.0))
        pitch = float(tts_options.get("pitch", 0.0))
        output_format = "wav"

        tts_request = TTSRequest(
            text=text,
            voice=voice,
            speed=speed,
            pitch=pitch,
            output_format=output_format,
            language=language,
        )

        response = await self.tts_service.synthesize_speech(
            tts_request,
            driver_name=tts_options.get("provider"),
            extra_options={
                "language": language,
            },
        )

        audio_dir = self.media_root / job_id / "audio"
        ensure_directory(str(audio_dir))
        destination_path = audio_dir / f"slide_{slide_number}.{output_format}"

        if response.file_path and Path(response.file_path).exists():
            shutil.copyfile(response.file_path, destination_path)
        else:
            duration = max(1.0, response.duration if response.duration else len(text.split()) / 2.5)
            self._write_silent_wav(destination_path, duration)

        return response, str(destination_path)

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

    async def _export_presentation(
        self,
        job_id: str,
        processed_slides: list[dict],
        request: PresentationRequest,
        audio_manifest: dict[str, Any] | None,
    ) -> ExportResponse:
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
        if audio_manifest:
            export_data["audio"] = audio_manifest

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

    @staticmethod
    def _serialize_metadata(metadata: dict[str, Any]) -> dict[str, Any]:
        """Serialize metadata to ensure JSON compatibility."""
        def serialize_value(value: Any) -> Any:
            if isinstance(value, datetime):
                return value.isoformat()
            elif isinstance(value, dict):
                return {k: serialize_value(v) for k, v in value.items()}
            elif isinstance(value, list):
                return [serialize_value(item) for item in value]
            elif hasattr(value, 'model_dump'):  # Pydantic model
                return value.model_dump()
            elif hasattr(value, '__dict__'):  # Other objects
                return str(value)  # Convert to string as fallback
            else:
                return value

        return {k: serialize_value(v) for k, v in metadata.items()}

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
