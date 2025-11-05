"""Azure Vision image analysis provider."""

from __future__ import annotations

import base64
from typing import Any

import aiohttp

from shared.models import ImageAnalysis, ImageData
from shared.utils import config as service_config

from .base import ImageAnalysisProvider


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

        confidence = caption_confidence if caption_confidence is not None else 0.8

        return ImageAnalysis(
            caption=caption_text or "Azure Vision description unavailable",
            confidence=min(0.95, max(0.6, confidence)),
            tags=list(dict.fromkeys(combined_tags)),
            objects=objects,
            text_snippets=metadata.get("text_snippets", []),
            dominant_colors=dominant_colors,
            raw_metadata=payload,
        )
