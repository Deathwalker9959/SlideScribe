"""OpenAI Vision image analysis provider."""

from __future__ import annotations

import json
from typing import Any

from shared.azure_openai_client import create_azure_openai_client, create_openai_client, get_azure_deployment_name
from shared.models import ImageAnalysis, ImageData
from shared.utils import config as service_config

from .base import ImageAnalysisProvider


class OpenAIVisionProvider(ImageAnalysisProvider):
    """OpenAI Vision via GPT-4o mini JSON response with Azure routing support."""

    def __init__(self) -> None:
        """Initialize OpenAI Vision client (direct or Azure)."""
        self.model: str = service_config.get("image_analysis_openai_model", "gpt-4o-mini")

        # Check if Azure OpenAI should be used for image analysis
        self.use_azure: bool = service_config.get("use_azure_openai_vision", False)

        if self.use_azure:
            # Use shared builder to create Azure client (eliminates duplication)
            self.client = create_azure_openai_client(async_client=True)
            # For Azure, use deployment name
            self.model_name = get_azure_deployment_name(self.model)
        else:
            # Use shared builder to create OpenAI client (eliminates duplication)
            self.client = create_openai_client(async_client=True)
            self.model_name = self.model

    async def analyze(self, image: ImageData, metadata: dict[str, Any]) -> ImageAnalysis:
        if not image.content_base64:
            raise RuntimeError("OpenAI Vision provider requires base64 image content")

        system_prompt = (
            "You are an assistant that describes slide images for presentation narration. "
            "Respond in JSON with keys: "
            "caption (string), tags (array of lowercase strings), objects (array of nouns), "
            "highlights (array of short bullet phrases), chart_details (array), "
            "table_summary (array), data_points (array of short facts), callouts (array of narration tips)."
        )

        try:
            response = await self.client.chat.completions.create(
                model=self.model_name,  # Uses deployment name for Azure, model name for OpenAI
                response_format={"type": "json_object"},
                messages=[
                    {"role": "system", "content": system_prompt},
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "input_text",
                                "text": "Describe this slide image for narration."
                                        " Include concise caption, keywords, and notable objects."
                                        " Return JSON only.",
                            },
                            {
                                "type": "input_image",
                                "image_base64": image.content_base64,
                            },
                        ],
                    },
                ],
                max_tokens=400,
            )
        except Exception as exc:  # pragma: no cover - network error fallback
            raise RuntimeError(f"OpenAI Vision request failed: {exc}") from exc

        content = response.choices[0].message.content
        try:
            payload = json.loads(content) if content else {}
        except json.JSONDecodeError as exc:
            raise RuntimeError("OpenAI response was not valid JSON") from exc

        caption = payload.get("caption") or payload.get("description")
        tags = [str(tag) for tag in payload.get("tags") or [] if tag]
        objects = [str(obj) for obj in payload.get("objects") or [] if obj]
        highlights = [str(item) for item in payload.get("highlights") or [] if item]
        chart_details = [str(item) for item in payload.get("chart_details") or payload.get("chart_insights") or [] if item]
        table_insights = [str(item) for item in payload.get("table_summary") or payload.get("table_insights") or [] if item]
        data_points = [str(item) for item in payload.get("data_points") or [] if item]
        callouts = [str(item) for item in payload.get("callouts") or [] if item]

        tokens_lower = [token.lower() for token in tags + objects]
        chart_keywords = {"chart", "graph", "diagram", "plot", "visual"}
        chart_present = any(keyword in token for token in tokens_lower for keyword in chart_keywords)
        if chart_present:
            if "chart" not in objects:
                objects.append("chart")
            if not any("chart" in snippet.lower() for snippet in highlights):
                highlights.append("Invite the audience to glance at the chart while you summarize the message.")
            if not chart_details:
                chart_details.append("Narration cue: highlight the chart trend instead of describing every detail.")

        include_callouts = service_config.get_pipeline_value(
            "pipelines.contextual_refinement.include_callouts",
            True,
        )
        if not include_callouts:
            callouts = []
        else:
            if chart_present and not any("narration cue" in callout.lower() for callout in callouts):
                callouts.append(
                    "Narration cue: point listeners to the chart or graph and state the key trend in one sentence."
                )
            if not callouts:
                callouts.append(
                    "Narration cue: acknowledge the visual briefly or move on if it is not critical."
                )

        confidence = 0.85

        return ImageAnalysis(
            caption=caption or "OpenAI Vision description unavailable",
            confidence=min(0.95, confidence),
            tags=tags,
            objects=objects,
            text_snippets=highlights,
            chart_insights=chart_details,
            table_insights=table_insights,
            data_points=data_points,
            callouts=callouts,
            dominant_colors=metadata.get("dominant_colors", []),
            raw_metadata=payload,
        )
