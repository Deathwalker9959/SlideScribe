"""Stub image analysis provider with heuristic results."""

from __future__ import annotations

from typing import Any

from shared.models import ImageAnalysis, ImageData
from shared.utils import config as service_config

from .base import ImageAnalysisProvider


class StubImageAnalysisProvider(ImageAnalysisProvider):
    """Generate deterministic analysis results without external services."""

    async def analyze(self, image: ImageData, metadata: dict[str, Any]) -> ImageAnalysis:
        description_parts: list[str] = []
        if image.description:
            description_parts.append(image.description)
        elif image.alt_text:
            description_parts.append(image.alt_text)

        if not description_parts and image.labels:
            description_parts.append(f"Contains {', '.join(image.labels[:3])}")

        slide_title = metadata.get("slide_title")
        if slide_title and slide_title not in description_parts:
            description_parts.append(f"Supports slide '{slide_title}'")

        caption = ". ".join(description_parts).strip() or "Slide visual element"

        tags = list({*(image.labels or []), *(image.detected_objects or [])})
        text_snippets = metadata.get("text_snippets") or []
        dominant_colors = image.dominant_colors or metadata.get("dominant_colors", [])

        lowercase_tokens = {token.lower() for token in [*tags, caption]}
        chart_insights: list[str] = []
        table_insights: list[str] = []
        callouts: list[str] = []
        data_points: list[str] = metadata.get("data_points") or []

        if any(keyword in lowercase_tokens for keyword in {"chart", "graph", "diagram"}):
            chart_insights.append("Highlight the chart and describe the trend it illustrates.")
            callouts.append("Explain what the chart reveals about the slide's topic.")
        if any(keyword in lowercase_tokens for keyword in {"table", "grid"}):
            table_insights.append("Walk through the table columns and spotlight critical comparisons.")
            callouts.append("Call out the most important figure shown in the table.")

        include_callouts = service_config.get_pipeline_value(
            "pipelines.contextual_refinement.include_callouts",
            True,
        )
        if not include_callouts:
            callouts = []

        confidence = 0.6
        if description_parts:
            confidence = max(confidence, 0.75)
        if tags:
            confidence = max(confidence, 0.8)

        return ImageAnalysis(
            caption=caption,
            confidence=min(0.95, confidence),
            tags=tags,
            objects=image.detected_objects or [],
            text_snippets=text_snippets,
            chart_insights=chart_insights,
            table_insights=table_insights,
            data_points=data_points,
            callouts=callouts,
            dominant_colors=dominant_colors,
            raw_metadata={
                "source_labels": image.labels,
                "source_objects": image.detected_objects,
                "mime_type": image.mime_type,
            },
        )
