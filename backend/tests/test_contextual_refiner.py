"""Unit tests for the contextual slide refiner."""

import pytest

from services.ai_refinement.contextual_refiner import ContextualRefiner
from shared.models import (
    ContextualRefinementRequest,
    ImageData,
    PresentationContext,
)


@pytest.mark.asyncio
async def test_contextual_refiner_enriches_text():
    """The refiner should incorporate visuals and transitions into the script."""
    refiner = ContextualRefiner()
    request = ContextualRefinementRequest(
        slide_text="Discuss quarterly revenue trends and highlight the growth drivers.",
        slide_title="Revenue Overview",
        images=[
            ImageData(
                image_id="img-1",
                description="A bar chart comparing quarterly revenue",
                labels=["revenue", "growth"],
            )
        ],
        presentation_context=PresentationContext(
            presentation_title="Q1 Executive Review",
            current_slide=3,
            total_slides=10,
            previous_slide_summary="We introduced the macro market conditions.",
            next_slide_summary="We will now review the product roadmap.",
            topic_keywords=["revenue", "growth"],
            audience="executive leadership",
        ),
    )

    result = await refiner.refine(request)

    assert "Visual references" in result.text
    assert any("bar chart" in reference for reference in result.image_references)
    assert result.transitions["position"] == "Slide 3 of 10"
    assert "Focus areas" in result.text
    assert result.confidence >= 0.7


@pytest.mark.asyncio
async def test_contextual_refiner_handles_empty_text():
    """Ensure graceful handling when the slide has no initial script."""
    refiner = ContextualRefiner()
    request = ContextualRefinementRequest(
        slide_text="",
        presentation_context=PresentationContext(
            current_slide=1,
            total_slides=5,
        ),
    )

    result = await refiner.refine(request)

    assert "has no narration content defined" in result.text
    assert result.highlights == []
    assert result.confidence >= 0.3
