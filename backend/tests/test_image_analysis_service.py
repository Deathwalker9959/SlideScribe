"""Tests for the image analysis service."""

import pytest
from unittest.mock import AsyncMock, patch

from services.image_analysis.service import ImageAnalysisService
from shared.models import ImageAnalysisRequest, ImageData


@pytest.mark.asyncio
async def test_analyze_slide_images_generates_enriched_metadata():
    service = ImageAnalysisService()
    request = ImageAnalysisRequest(
        presentation_id="pres-1",
        slide_id="slide-1",
        images=[
            ImageData(
                image_id="img-1",
                description="A line chart displaying revenue growth",
                labels=["chart", "revenue", "growth"],
                detected_objects=["line", "axis"],
                dominant_colors=["blue", "white"],
            )
        ],
        metadata={"slide_title": "Revenue Overview"},
    )

    response = await service.analyze_slide_images(request)

    assert response.results
    analysis = response.results[0].analysis
    assert analysis.caption
    assert "Revenue Overview" in analysis.caption
    assert "chart" in analysis.tags
    assert analysis.confidence >= 0.75
    assert analysis.chart_insights
    assert any("chart" in insight.lower() for insight in analysis.chart_insights)
    assert analysis.callouts


@pytest.mark.asyncio
async def test_analyze_slide_images_uses_cache(monkeypatch):
    service = ImageAnalysisService()
    request = ImageAnalysisRequest(
        presentation_id="pres-cache",
        slide_id="slide-cache",
        images=[
            ImageData(
                image_id="img-cache",
                labels=["diagram"],
            )
        ],
    )

    await service.analyze_slide_images(request)

    with patch.object(service, "_generate_analysis", AsyncMock(side_effect=AssertionError("cache miss"))):
        response = await service.analyze_slide_images(request)

    assert response.results[0].analysis.caption


@pytest.mark.asyncio
async def test_get_cached_analysis_returns_snapshot():
    service = ImageAnalysisService()
    request = ImageAnalysisRequest(
        presentation_id="pres-snapshot",
        slide_id="slide-snapshot",
        images=[ImageData(image_id="img-snapshot", description="Product photo")],
    )

    await service.analyze_slide_images(request)
    service.cache.clear()
    cached = await service.get_cached_analysis("pres-snapshot", "slide-snapshot")

    assert cached is not None
    assert cached.results[0].analysis.caption


@pytest.mark.asyncio
async def test_purge_cached_analysis_removes_files():
    service = ImageAnalysisService()
    request = ImageAnalysisRequest(
        presentation_id="pres-purge",
        slide_id="slide-purge",
        images=[ImageData(image_id="img-purge", description="Mock image")],
    )

    await service.analyze_slide_images(request)
    assert await service.get_cached_analysis("pres-purge", "slide-purge") is not None

    service.purge_cached_analysis("pres-purge", "slide-purge")

    service.cache.clear()
    assert await service.get_cached_analysis("pres-purge", "slide-purge") is None


@pytest.mark.asyncio
async def test_notify_analysis_completed_uses_websocket(monkeypatch):
    service = ImageAnalysisService()
    request = ImageAnalysisRequest(
        presentation_id="pres-ws",
        slide_id="slide-ws",
        job_id="job-123",
        images=[ImageData(image_id="img-ws", description="Visual")],
    )

    events: list[dict] = []

    async def fake_broadcast(message):  # type: ignore[override]
        events.append(message)

    from types import SimpleNamespace
    from services import websocket_progress

    monkeypatch.setattr(
        websocket_progress,
        "websocket_manager",
        SimpleNamespace(broadcast_system_message=fake_broadcast),
    )

    await service.analyze_slide_images(request)

    assert [event.get("event") for event in events] == [
        "image_analysis_started",
        "image_analysis_progress",
        "image_analysis_completed",
    ]
    assert events[-1].get("job_id") == "job-123"
    status = service.get_job_status("job-123")
    assert status is not None
    assert status["status"] == "completed"
    assert status["processed_images"] == 1


@pytest.mark.asyncio
async def test_get_job_status_unknown_id_returns_none():
    service = ImageAnalysisService()
    assert service.get_job_status("missing") is None


@pytest.mark.asyncio
async def test_fallback_analysis_populates_data_points():
    service = ImageAnalysisService()
    service.provider = AsyncMock()
    service.provider.analyze.side_effect = RuntimeError("force fallback")  # type: ignore[attr-defined]

    request = ImageAnalysisRequest(
        presentation_id="pres-fallback",
        slide_id="slide-fallback",
        images=[
            ImageData(
                image_id="img-fallback",
                description="Table comparing Q1 2024 revenue 1.2M vs Q1 2025 revenue 1.8M",
                labels=["table", "comparison"],
            )
        ],
    )

    response = await service.analyze_slide_images(request)
    analysis = response.results[0].analysis

    assert analysis.table_insights
    assert analysis.data_points
    assert any("1.2" in point or "1.8" in point for point in analysis.data_points)
