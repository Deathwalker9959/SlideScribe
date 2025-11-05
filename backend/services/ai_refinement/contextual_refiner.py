"""Context-aware refinement utilities for slide narration generation."""

from __future__ import annotations

import re
from typing import Iterable

from shared.models import (
    ContextualRefinementRequest,
    ImageData,
    PresentationContext,
    RefinedScript,
)
from shared.utils import setup_logging


class ContextualRefiner:
    """Generate refined narration that incorporates slide and presentation context."""

    def __init__(self, logger=None):
        self.logger = logger or setup_logging("contextual-refiner")

    async def refine_with_context(
        self,
        slide_text: str,
        slide_images: list[ImageData],
        presentation_context: PresentationContext,
        *,
        slide_title: str | None = None,
        slide_notes: str | None = None,
        slide_layout: str | None = None,
    ) -> RefinedScript:
        """Entry point that mirrors the TODO.md signature."""
        request = ContextualRefinementRequest(
            slide_text=slide_text,
            slide_title=slide_title,
            slide_layout=slide_layout,
            slide_notes=slide_notes,
            images=slide_images,
            presentation_context=presentation_context,
        )
        return await self.refine(request)

    async def refine(self, request: ContextualRefinementRequest) -> RefinedScript:
        """Generate a refined script using contextual cues."""
        enriched_text, highlights, image_references, transitions = self._compose_script(request)
        confidence = self._estimate_confidence(request, highlights, image_references, transitions)

        return RefinedScript(
            text=enriched_text,
            highlights=highlights,
            image_references=image_references,
            transitions=transitions,
            confidence=confidence,
        )

    def _compose_script(
        self,
        request: ContextualRefinementRequest,
    ) -> tuple[str, list[str], list[str], dict[str, str]]:
        """Combine contextual elements into the final narration string."""
        original_text = request.slide_text.strip()
        base_text = original_text
        if not base_text:
            base_text = "This slide currently has no narration content defined. Briefly describe the key message."

        highlights = [] if not original_text else self._extract_highlights(base_text)
        image_references = self._build_image_references(request.images)
        transitions = self._build_transitions(request.presentation_context)

        blocks: list[str] = [base_text]

        if image_references:
            blocks.append("Visual references:")
            blocks.extend(f"- {reference}" for reference in image_references)

        if transitions:
            blocks.append(self._format_transitions(transitions))

        return "\n".join(blocks).strip(), highlights, image_references, transitions

    def _extract_highlights(self, text: str) -> list[str]:
        """Return the key sentences that should be emphasised."""
        sentences = [sentence.strip() for sentence in re.split(r"(?<=[.!?])\s+", text) if sentence.strip()]
        return sentences[:3]

    def _build_image_references(self, images: Iterable[ImageData]) -> list[str]:
        """Generate narration cues that reference slide visuals."""
        references: list[str] = []
        for index, image in enumerate(images, start=1):
            analysis = image.analysis
            description = (
                (analysis.caption if analysis and analysis.caption else None)
                or image.description
                or image.alt_text
            )

            labels = analysis.tags if analysis and analysis.tags else image.labels
            objects = analysis.objects if analysis and analysis.objects else image.detected_objects

            label_text = ", ".join(labels[:3]) if labels else ""
            object_text = ", ".join(objects[:3]) if objects else ""
            detail_segments = [segment for segment in (label_text, object_text) if segment]

            if description:
                reference = f"Image {index}: {description}"
                if detail_segments:
                    reference = f"{reference} (keywords: {', '.join(detail_segments)})"
            elif detail_segments:
                reference = f"Image {index}: depicts {', '.join(detail_segments)}"
            else:
                continue

            references.append(reference)

        return references

    def _build_transitions(self, context: PresentationContext) -> dict[str, str]:
        """Create transition guidance using presentation context."""
        transitions: dict[str, str] = {}

        if context.presentation_title:
            transitions["presentation"] = f"Presentation: {context.presentation_title}"

        if context.current_slide and context.total_slides:
            transitions["position"] = f"Slide {context.current_slide} of {context.total_slides}"

        if context.previous_slide_summary:
            transitions["from_previous"] = f"Refer back to: {context.previous_slide_summary}"

        if context.next_slide_summary:
            transitions["to_next"] = f"Preview next: {context.next_slide_summary}"

        if context.topic_keywords:
            transitions["keywords"] = f"Focus areas: {', '.join(context.topic_keywords[:5])}"

        if context.audience:
            transitions["audience"] = f"Tailor language for {context.audience} audience"

        return transitions

    def _format_transitions(self, transitions: dict[str, str]) -> str:
        """Format transition cues for easy consumption."""
        lines = ["Context cues:"]
        for key, value in transitions.items():
            label = key.replace("_", " ").title()
            lines.append(f"- {label}: {value}")
        return "\n".join(lines)

    def _estimate_confidence(
        self,
        request: ContextualRefinementRequest,
        highlights: list[str],
        image_references: list[str],
        transitions: dict[str, str],
    ) -> float:
        """Heuristically estimate how well context has been incorporated."""
        score = 0.55
        if highlights:
            score += 0.1
        if image_references:
            score += 0.15
        if transitions:
            score += 0.1
        if request.slide_notes:
            score += 0.05
        if request.presentation_context.topic_keywords:
            score += 0.05
        if request.presentation_context.audience:
            score += 0.05

        return min(0.95, max(0.3, score))
