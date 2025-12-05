"""Azure Vision image analysis provider."""

from __future__ import annotations

import base64
import logging
from typing import Any

import aiohttp

from shared.models import ImageAnalysis, ImageData
from shared.utils import config as service_config

from .base import ImageAnalysisProvider

logger = logging.getLogger(__name__)


class AzureVisionProvider(ImageAnalysisProvider):
    """Azure Computer Vision describe service integration."""

    def __init__(self) -> None:
        self.endpoint: str | None = service_config.get("azure_vision_endpoint")
        self.key: str | None = service_config.get("azure_vision_key")
        self.api_version: str = service_config.get("azure_vision_api_version", "v3.2")

    async def analyze(self, image: ImageData, metadata: dict[str, Any]) -> ImageAnalysis:
        if not self.endpoint or not self.key:
            raise RuntimeError("Azure Vision credentials not configured")

        if not image.content_base64:
            raise RuntimeError("Azure Vision provider requires base64 image content")

        data = base64.b64decode(image.content_base64)
        analyze_url = f"{self.endpoint.rstrip('/')}/vision/{self.api_version}/analyze"
        params = {
            "visualFeatures": "Description,Tags,Color,Objects",
        }
        headers = {
            "Ocp-Apim-Subscription-Key": self.key,
            "Content-Type": "application/octet-stream",
        }

        timeout = aiohttp.ClientTimeout(total=30)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(analyze_url, params=params, data=data, headers=headers) as resp:
                if resp.status >= 400:
                    detail = await resp.text()
                    raise RuntimeError(f"Azure Vision request failed: {resp.status} {detail}")
                payload = await resp.json()

        description = payload.get("description", {})
        captions = description.get("captions", [])
        caption_text = captions[0]["text"] if captions else None
        caption_confidence = captions[0].get("confidence") if captions else None

        tags = payload.get("description", {}).get("tags", [])
        tag_objects = [tag.get("name") if isinstance(tag, dict) else tag for tag in payload.get("tags", [])]
        combined_tags = [tag for tag in tags if isinstance(tag, str)] + [t for t in tag_objects if t]

        objects = [obj.get("object") for obj in payload.get("objects", []) if obj.get("object")]
        dominant_colors = payload.get("color", {}).get("dominantColors", [])

        highlights = metadata.get("text_snippets", []).copy()
        tokens_lower = [str(token).lower() for token in combined_tags + objects]
        chart_keywords = {"chart", "graph", "diagram", "plot", "visual"}
        chart_present = any(keyword in token for token in tokens_lower for keyword in chart_keywords)
        if chart_present:
            if "chart" not in objects:
                objects.append("chart")
            highlights.append("Invite the audience to review the chart while you summarize the message.")

        chart_details: list[str] = []
        table_insights: list[str] = []
        data_points: list[str] = list(metadata.get("data_points", []))
        callouts: list[str] = list(metadata.get("callouts", []))

        for obj in payload.get("objects", []):
            name = (obj.get("object") or "").lower()
            rectangle = obj.get("rectangle") or {}
            region = self._format_region(rectangle)
            confidence_text = (
                f" ({obj.get('confidence'):.0%})"
                if isinstance(obj.get("confidence"), (float, int))
                else ""
            )
            if name in {"chart", "graph", "diagram"}:
                detail = f"{name.title()} visual{region}{confidence_text}".strip()
                chart_details.append(detail)
            elif name in {"table", "grid"}:
                detail = f"Tabular data{region}{confidence_text}".strip()
                table_insights.append(detail)

        if caption_text and any(keyword in caption_text.lower() for keyword in ("chart", "graph", "diagram")):
            chart_details.insert(0, f"{caption_text} (Azure Vision)")
        if caption_text and "table" in caption_text.lower():
            table_insights.insert(0, f"{caption_text} (Azure Vision)")

        if not callouts and chart_present:
            callouts.append(
                "Narration cue: point the audience to the chart or graph and describe the headline trend."
            )
        if not callouts and table_insights:
            callouts.append(
                "Narration cue: reference the table briefly and call out the single figure that matters most."
            )
        if not callouts:
            callouts.append(
                "Narration cue: acknowledge the visual briefly or move on if it does not support the story."
            )

        include_callouts = service_config.get_pipeline_value(
            "pipelines.contextual_refinement.include_callouts",
            True,
        )
        if not include_callouts:
            callouts = []

        confidence = caption_confidence if caption_confidence is not None else 0.8

        analysis = ImageAnalysis(
            caption=caption_text or "Azure Vision description unavailable",
            confidence=min(0.95, max(0.6, confidence)),
            tags=list(dict.fromkeys(combined_tags)),
            objects=objects,
            text_snippets=highlights,
            chart_insights=chart_details,
            table_insights=table_insights,
            data_points=data_points,
            callouts=callouts,
            dominant_colors=dominant_colors,
            raw_metadata=payload,
        )

        logger.info(
            "Azure Vision: caption=%s tags=%d objects=%d callouts=%d chart_insights=%d table_insights=%d",
            (caption_text or "n/a")[:120],
            len(analysis.tags),
            len(analysis.objects),
            len(analysis.callouts),
            len(analysis.chart_insights),
            len(analysis.table_insights),
        )

        return analysis

    @staticmethod
    def _format_region(rectangle: dict[str, Any]) -> str:
        if not rectangle:
            return ""
        left = rectangle.get("x")
        top = rectangle.get("y")
        width = rectangle.get("w") or rectangle.get("width")
        height = rectangle.get("h") or rectangle.get("height")
        if all(isinstance(value, (int, float)) for value in (left, top, width, height)):
            return f" near ({int(left)}, {int(top)}) {int(width)}x{int(height)}"
        return ""
