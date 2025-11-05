"""Base classes for image analysis providers."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from shared.models import ImageAnalysis, ImageData


class ImageAnalysisProvider(ABC):
    """Abstract provider responsible for enriching slide images with metadata."""

    @abstractmethod
    async def analyze(self, image: ImageData, metadata: dict[str, Any]) -> ImageAnalysis:
        """Return contextual information for a slide image."""

