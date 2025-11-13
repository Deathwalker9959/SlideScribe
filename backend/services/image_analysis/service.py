"""Image analysis service implementation."""

from __future__ import annotations

import json
import re
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from shared.models import (
    ImageAnalysis,
    ImageAnalysisRequest,
    ImageAnalysisResponse,
    ImageAnalysisResult,
    ImageData,
)
from shared.utils import Cache, ensure_directory, generate_hash, setup_logging, config as service_config

from .drivers import ImageAnalysisProvider, StubImageAnalysisProvider


class ImageAnalysisService:
    """Provide lightweight slide image analysis with caching."""

    def __init__(self) -> None:
        self.logger = setup_logging("image-analysis-service")
        self.cache = Cache()
        self.cache_ttl = int(service_config.get("image_analysis_cache_ttl", 3600))
        self.provider = self._load_provider(service_config.get("image_analysis_provider", "stub"))
        media_root = Path(service_config.get("media_root", "./media"))
        self.storage_root = self._initialize_storage_root(media_root / "image_analysis")
        self.job_states: dict[str, dict[str, Any]] = {}

    def _load_provider(self, provider_name: str) -> ImageAnalysisProvider:
        from .drivers.azure import AzureVisionProvider  # lazy import
        from .drivers.openai import OpenAIVisionProvider  # lazy import

        providers: dict[str, type[ImageAnalysisProvider]] = {
            "stub": StubImageAnalysisProvider,
            "azure": AzureVisionProvider,
            "openai": OpenAIVisionProvider,
        }

        provider_cls = providers.get(provider_name.lower())
        if provider_cls is None:
            self.logger.warning("Unknown image analysis provider '%s', falling back to stub", provider_name)
            provider_cls = StubImageAnalysisProvider
        return provider_cls()

    def _initialize_storage_root(self, target: Path) -> Path:
        try:
            ensure_directory(str(target))
            return target
        except PermissionError:
            fallback = Path("./media/image_analysis")
            self.logger.warning(
                "Unable to create image analysis storage at %s; falling back to %s",
                target,
                fallback,
            )
            ensure_directory(str(fallback))
            return fallback

    async def analyze_slide_images(self, request: ImageAnalysisRequest) -> ImageAnalysisResponse:
        """Analyze slide images, enriching metadata and caching results."""
        start_time = time.time()
        results: list[ImageAnalysisResult] = []

        metadata = request.metadata or {}
        job_state = None

        if request.job_id:
            job_state = {
                "job_id": request.job_id,
                "slide_id": request.slide_id,
                "total_images": len(request.images),
                "processed_images": 0,
                "status": "processing",
                "started_at": time.time(),
            }
            self.job_states[request.job_id] = job_state
            await self._publish_job_event(
                request.job_id,
                "image_analysis_started",
                slide_id=request.slide_id,
                total_images=job_state["total_images"],
                processed_images=0,
            )

        for image in request.images:
            cache_key = self._build_cache_key(request.presentation_id, request.slide_id, image)
            cached = self.cache.get(cache_key)
            if cached:
                results.append(self._deserialize_result(cached))
                continue

            analysis = await self._generate_analysis(image, metadata)
            result = ImageAnalysisResult(image_id=image.image_id, analysis=analysis)
            self.cache.set(cache_key, result.model_dump(), ttl_seconds=self.cache_ttl)
            results.append(result)

            if job_state:
                job_state["processed_images"] += 1
                job_state["last_updated"] = time.time()
                await self._publish_job_event(
                    request.job_id,
                    "image_analysis_progress",
                    slide_id=request.slide_id,
                    total_images=job_state["total_images"],
                    processed_images=job_state["processed_images"],
                )

        processing_time = time.time() - start_time

        # Store aggregate response for slide-level lookup
        self._store_slide_snapshot(request, results, processing_time)

        response = ImageAnalysisResponse(results=results, processing_time=processing_time)

        if request.job_id:
            job_state = self.job_states.get(request.job_id, {})
            job_state.update(
                {
                    "status": "completed",
                    "completed_at": time.time(),
                    "results": [result.model_dump() for result in results],
                    "processing_time": processing_time,
                }
            )
            await self._publish_job_event(
                request.job_id,
                "image_analysis_completed",
                slide_id=request.slide_id,
                total_images=job_state.get("total_images"),
                processed_images=job_state.get("processed_images"),
                analysis=job_state.get("results"),
                processing_time=processing_time,
            )

        return response

    async def get_cached_analysis(
        self,
        presentation_id: str | None,
        slide_id: str | None,
    ) -> ImageAnalysisResponse | None:
        """Retrieve cached analysis for a slide if available."""
        if not presentation_id or not slide_id:
            return None

        slide_key = self._build_slide_key(presentation_id, slide_id)
        cached = self.cache.get(slide_key)
        if not cached:
            cached = self._load_slide_snapshot_from_disk(presentation_id, slide_id)
            if cached:
                self.cache.set(slide_key, cached, ttl_seconds=self.cache_ttl)
            else:
                return None

        results = [self._deserialize_result(item) for item in cached.get("results", [])]
        return ImageAnalysisResponse(results=results, processing_time=cached.get("processing_time", 0.0))

    def reset(self) -> None:
        """Clear all cached analysis results (used in tests)."""
        self.cache.clear()
        if self.storage_root.exists():
            for child in self.storage_root.glob("**/*.json"):
                try:
                    child.unlink()
                except OSError:
                    continue
        self.job_states.clear()

    async def _generate_analysis(self, image: ImageData, metadata: dict[str, Any]) -> ImageAnalysis:
        """Generate analysis via provider with heuristic fallback."""
        try:
            return await self.provider.analyze(image, metadata)
        except Exception as exc:  # pragma: no cover - defensive logging path
            self.logger.warning("Image provider failed (%s); using fallback analysis", exc)
            return self._fallback_analysis(image, metadata)

    def _fallback_analysis(self, image: ImageData, metadata: dict[str, Any]) -> ImageAnalysis:
        """Heuristic analysis that enriches image metadata for narration."""
        tags = self._merge_unique(image.labels, image.detected_objects)
        description_components = [component for component in (image.description, image.alt_text) if component]

        if tags and not description_components:
            description_components.append(f"Contains {', '.join(tags[:3])}")

        slide_title = metadata.get("slide_title") if metadata else None
        if slide_title and slide_title not in description_components:
            description_components.append(f"Supports slide topic '{slide_title}'")

        caption = ". ".join(description_components).strip()
        if not caption:
            caption = "Slide visual element"

        text_snippets = metadata.get("text_snippets", []) if metadata else []
        if image.analysis and image.analysis.text_snippets:
            text_snippets = self._merge_unique(text_snippets, image.analysis.text_snippets)

        chart_insights = list(metadata.get("chart_insights", [])) if metadata else []
        table_insights = list(metadata.get("table_insights", [])) if metadata else []
        callouts = list(metadata.get("callouts", [])) if metadata else []
        data_points = list(metadata.get("data_points", [])) if metadata else []

        lowercase_tokens = {token.lower() for token in (*tags, caption.split())}
        chart_keywords = {"chart", "graph", "diagram", "plot", "visual"}
        if any(keyword in lowercase_tokens for keyword in chart_keywords):
            if "Invite the audience to look at the chart or graph while you summarize the takeaway." not in chart_insights:
                chart_insights.append(
                    "Invite the audience to look at the chart or graph while you summarize the takeaway."
                )
            if "Narration cue: direct attention to the visual and state the key trend in one sentence." not in callouts:
                callouts.append(
                    "Narration cue: direct attention to the visual and state the key trend in one sentence."
                )
        if any(keyword in lowercase_tokens for keyword in {"table", "grid"}):
            if "Point the audience to the table while you highlight the most important comparison." not in table_insights:
                table_insights.append(
                    "Point the audience to the table while you highlight the most important comparison."
                )
            if "Narration cue: reference the table briefly and call out the one figure that matters most." not in callouts:
                callouts.append(
                    "Narration cue: reference the table briefly and call out the one figure that matters most."
                )
        if not tags and not description_components:
            callouts.append("Narration cue: acknowledge the visual briefly or skip it if it does not support the story.")

        include_callouts = service_config.get_pipeline_value(
            "pipelines.contextual_refinement.include_callouts",
            True,
        )
        if not include_callouts:
            callouts = []

        extracted_numbers = re.findall(r"\b\d+(?:\.\d+)?%?", " ".join(description_components))
        if extracted_numbers:
            for value in extracted_numbers:
                formatted = f"Emphasize the value {value}"
                if formatted not in data_points:
                    data_points.append(formatted)

        dominant_colors = image.dominant_colors or metadata.get("dominant_colors", [])

        confidence = image.analysis.confidence if image.analysis else 0.6
        if description_components:
            confidence = max(confidence, 0.75)
        if tags:
            confidence = max(confidence, 0.8)

        raw_metadata = {
            "source_labels": image.labels,
            "source_objects": image.detected_objects,
            "mime_type": image.mime_type,
        }

        return ImageAnalysis(
            caption=caption,
            confidence=min(confidence, 0.95),
            tags=tags,
            objects=image.detected_objects,
            text_snippets=text_snippets,
            chart_insights=chart_insights,
            table_insights=table_insights,
            data_points=data_points,
            callouts=callouts,
            dominant_colors=dominant_colors,
            raw_metadata=raw_metadata,
        )

    def _build_cache_key(
        self,
        presentation_id: str | None,
        slide_id: str | None,
        image: ImageData,
    ) -> str:
        payload = f"{presentation_id or 'unknown'}:{slide_id or 'unknown'}:{image.image_id}:{image.description}:{image.alt_text}:{','.join(image.labels)}:{','.join(image.detected_objects)}:{image.mime_type}"
        return f"analysis:image:{generate_hash(payload)}"

    def _build_slide_key(self, presentation_id: str, slide_id: str) -> str:
        return f"analysis:slide:{generate_hash(f'{presentation_id}:{slide_id}')}"

    def _store_slide_snapshot(
        self,
        request: ImageAnalysisRequest,
        results: list[ImageAnalysisResult],
        processing_time: float,
    ) -> None:
        if not request.presentation_id or not request.slide_id:
            return

        slide_key = self._build_slide_key(request.presentation_id, request.slide_id)
        payload = {
            "results": [result.model_dump() for result in results],
            "processing_time": processing_time,
        }
        self.cache.set(slide_key, payload, ttl_seconds=self.cache_ttl)
        self._persist_slide_snapshot(request.presentation_id, request.slide_id, payload)

    def _deserialize_result(self, payload: dict[str, Any]) -> ImageAnalysisResult:
        return ImageAnalysisResult(
            image_id=payload["image_id"],
            analysis=ImageAnalysis(**payload["analysis"]),
        )

    @staticmethod
    def _merge_unique(primary: list[str], secondary: list[str]) -> list[str]:
        seen: set[str] = set()
        merged: list[str] = []
        for value in primary + secondary:
            if not value:
                continue
            normalized = value.strip()
            if normalized and normalized.lower() not in seen:
                seen.add(normalized.lower())
                merged.append(normalized)
        return merged

    def _persist_slide_snapshot(self, presentation_id: str, slide_id: str, payload: dict[str, Any]) -> None:
        slide_dir = self.storage_root / presentation_id
        ensure_directory(str(slide_dir))
        snapshot_path = slide_dir / f"{slide_id}.json"
        try:
            snapshot_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        except OSError as exc:
            self.logger.warning("Failed to persist image analysis snapshot: %s", exc)

    def _load_slide_snapshot_from_disk(self, presentation_id: str, slide_id: str) -> dict[str, Any] | None:
        snapshot_path = self.storage_root / presentation_id / f"{slide_id}.json"
        if not snapshot_path.exists():
            return None
        try:
            return json.loads(snapshot_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            self.logger.warning("Failed to load cached image analysis snapshot: %s", exc)
            return None

    def purge_cached_analysis(self, presentation_id: str, slide_id: str) -> None:
        """Remove cached analysis for a specific slide."""
        slide_key = self._build_slide_key(presentation_id, slide_id)
        self.cache.delete(slide_key)
        slide_dir = self.storage_root / presentation_id
        snapshot_path = slide_dir / f"{slide_id}.json"
        if snapshot_path.exists():
            try:
                snapshot_path.unlink()
            except OSError:
                pass

    async def _publish_job_event(
        self,
        job_id: str,
        event: str,
        *,
        slide_id: str | None = None,
        total_images: int | None = None,
        processed_images: int | None = None,
        analysis: list[dict[str, Any]] | None = None,
        processing_time: float | None = None,
    ) -> None:
        try:
            from services.websocket_progress import websocket_manager
        except ImportError:  # pragma: no cover
            return

        payload = {
            "event": event,
            "job_id": job_id,
            "slide_id": slide_id,
            "total_images": total_images,
            "processed_images": processed_images,
            "analysis": analysis,
            "processing_time": processing_time,
        }

        try:
            await websocket_manager.broadcast_system_message(payload)
        except Exception as exc:  # pragma: no cover
            self.logger.warning("Failed to broadcast image analysis event: %s", exc)

    def get_job_status(self, job_id: str) -> dict[str, Any] | None:
        job_state = self.job_states.get(job_id)
        if not job_state:
            return None

        return {
            **job_state,
            "started_at": self._format_timestamp(job_state.get("started_at")),
            "last_updated": self._format_timestamp(job_state.get("last_updated")),
            "completed_at": self._format_timestamp(job_state.get("completed_at")),
        }

    @staticmethod
    def _format_timestamp(timestamp: float | None) -> str | None:
        if not timestamp:
            return None
        return datetime.fromtimestamp(timestamp, tz=UTC).isoformat()
