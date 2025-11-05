"""OpenAI Vision image analysis provider."""

from __future__ import annotations

import json
from typing import Any

from openai import AsyncOpenAI

from shared.models import ImageAnalysis, ImageData
from shared.utils import config as service_config

from .base import ImageAnalysisProvider


class OpenAIVisionProvider(ImageAnalysisProvider):
    """OpenAI Vision via GPT-4o mini JSON response."""

    def __init__(self) -> None:
        self.api_key: str | None = service_config.get("openai_api_key")
        self.model: str = service_config.get("image_analysis_openai_model", "gpt-4o-mini")
        self._client: AsyncOpenAI | None = None

    @property
    def client(self) -> AsyncOpenAI:
        if self._client is None:
            self._client = AsyncOpenAI(api_key=self.api_key)
        return self._client

    async def analyze(self, image: ImageData, metadata: dict[str, Any]) -> ImageAnalysis:
        if not self.api_key:
            raise RuntimeError("OpenAI API key not configured")

        if not image.content_base64:
            raise RuntimeError("OpenAI Vision provider requires base64 image content")

        system_prompt = (
            "You are an assistant that describes images for presentation narration. "
            "Respond in JSON with keys: caption (string), tags (array of lowercase strings), "
            "objects (array of nouns), highlights (array of short bullet phrases)."
        )

        try:
            response = await self.client.chat.completions.create(
                model=self.model,
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
            raise RuntimeError(f"OpenAI request failed: {exc}") from exc

        content = response.choices[0].message.content
        try:
            payload = json.loads(content) if content else {}
        except json.JSONDecodeError as exc:
            raise RuntimeError("OpenAI response was not valid JSON") from exc

        caption = payload.get("caption") or payload.get("description")
        tags = payload.get("tags") or []
        objects = payload.get("objects") or []
        highlights = payload.get("highlights") or []

        confidence = 0.85

        return ImageAnalysis(
            caption=caption or "OpenAI Vision description unavailable",
            confidence=min(0.95, confidence),
            tags=[str(tag) for tag in tags if tag],
            objects=[str(obj) for obj in objects if obj],
            text_snippets=[str(hl) for hl in highlights if hl],
            dominant_colors=metadata.get("dominant_colors", []),
            raw_metadata=payload,
        )
