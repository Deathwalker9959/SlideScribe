"""Tests for the narration service."""

import json
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from services.narration.orchestrator import (
    NarrationOrchestrator,
    JobStatus,
    ProcessingStep,
    ProgressUpdate,
)
from services.narration.app import app
from services.voice_profiles.manager import VoiceProfileManager
from shared.models import (
    ExportFormat,
    ExportRequest,
    ExportResponse,
    ImageAnalysis,
    ImageAnalysisResponse,
    ImageAnalysisResult,
    ImageData,
    PresentationRequest,
    RefinedScript,
    SlideContent,
    SubtitleEntry,
    TTSResponse,
)
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    """Test client for the narration service."""
    return TestClient(app)


@pytest.fixture
def orchestrator(tmp_path):
    """Narration orchestrator instance for testing."""
    instance = NarrationOrchestrator()

    class StubAudioProcessor:
        async def combine_segments(self, request):  # type: ignore[no-untyped-def]
            from shared.models import AudioCombineResponse

            return AudioCombineResponse(
                job_id=request.job_id,
                output_path=f"/tmp/{request.job_id}.wav",
                total_duration=sum(segment.duration for segment in request.segments),
                segment_count=len(request.segments),
                created_at=datetime.now(timezone.utc),
            )

        async def apply_transitions(self, request):  # type: ignore[no-untyped-def]
            from shared.models import AudioTransitionResponse

            return AudioTransitionResponse(
                job_id=request.job_id,
                output_path=request.combined_audio_path,
                transitions_applied=len(request.transitions),
                created_at=datetime.now(timezone.utc),
            )

        def get_job_status(self, job_id):  # type: ignore[no-untyped-def]
            return {"job_id": job_id}

        async def export_mix(self, request):  # type: ignore[no-untyped-def]
            from shared.models import AudioExportResponse

            export_path = f"/tmp/{request.job_id}.{request.format}"
            return AudioExportResponse(
                job_id=request.job_id,
                export_path=export_path,
                format=request.format,
                file_size=1024,
                created_at=datetime.now(timezone.utc),
            )

    instance.audio_processor = StubAudioProcessor()
    instance.voice_profile_manager = VoiceProfileManager(
        storage_path=str(tmp_path / "voice_profiles.json")
    )
    return instance


@pytest.fixture
def sample_presentation():
    """Sample presentation request for testing."""
    return PresentationRequest(
        slides=[
            SlideContent(
                slide_id="slide_1",
                title="Introduction",
                content="Welcome to this presentation about AI and machine learning.",
                notes="Keep it engaging and professional",
            ),
            SlideContent(
                slide_id="slide_2",
                title="Main Content",
                content="Machine learning algorithms can be categorized into supervised and unsupervised learning.",
                notes="Explain clearly with examples",
            ),
        ],
        settings={"voice": "en-US-AriaNeural", "speed": 1.0},
        metadata={"title": "AI Presentation", "author": "Test User"},
    )


@pytest.fixture
def sample_export_request():
    """Sample export request for testing."""
    return ExportRequest(
        presentation_id="test_presentation_123",
        export_format=ExportFormat.PPTX,
        include_audio=True,
        include_subtitles=True,
        quality="high",
    )


class TestNarrationOrchestrator:
    """Test cases for the NarrationOrchestrator class."""

    @pytest.mark.asyncio
    async def test_process_presentation_creates_job(self, orchestrator, sample_presentation):
        """Test that processing a presentation creates a job ID."""
        with patch.object(orchestrator.queue_manager, 'enqueue', new_callable=AsyncMock) as mock_enqueue:
            job_id = await orchestrator.process_presentation(sample_presentation)

            assert job_id is not None
            assert len(job_id) > 0

            # Verify job was stored in cache
            job_data = orchestrator.cache.get(f"job:{job_id}")
            assert job_data is not None
            assert job_data["status"] == JobStatus.QUEUED
            assert job_data["total_slides"] == len(sample_presentation.slides)

            # Verify job was enqueued
            mock_enqueue.assert_called_once()

    @pytest.mark.asyncio
    async def test_process_slide_complete_pipeline(self, orchestrator):
        """Test processing a single slide through the complete pipeline."""
        slide = SlideContent(
            slide_id="test_slide",
            title="Test Slide",
            content="This is a test slide for processing.",
            notes="Mention the chart on the right",
        )

        # Mock the services
        with patch.object(orchestrator, 'ai_refinement_service') as mock_ai, \
             patch.object(orchestrator, 'tts_service') as mock_tts:

            # Mock AI refinement response
            mock_ai.refine_text = AsyncMock(return_value=MagicMock(
                refined_text="This is a refined test slide for processing."
            ))
            mock_ai.refine_with_context = AsyncMock(return_value=RefinedScript(
                text="This is a refined test slide for processing.\nVisual references:\n- Image 1: chart description",
                highlights=["This is a refined test slide for processing."],
                image_references=["Image 1: chart description"],
                transitions={"position": "Slide 1 of 1"},
                confidence=0.8,
            ))

            # Mock TTS response
            mock_tts.synthesize_speech = AsyncMock(return_value=TTSResponse(
                audio_url="/media/test/audio.wav",
                duration=5.0,
                file_size=1024000,
                voice_used="en-US-AriaNeural",
                processing_time=1.5,
            ))

        result = await orchestrator.process_slide("test_job", slide, 1, tts_options={})

            assert result["status"] == "completed"
            assert result["slide_id"] == "test_slide"
            assert result["slide_number"] == 1
            assert "refined_content" in result
            assert "audio_result" in result
            assert "audio_file_path" in result
            assert "subtitles" in result
            assert "processing_time" in result
            assert "contextual_metadata" in result
            assert result["contextual_metadata"]["image_references"] == ["Image 1: chart description"]
            assert result["contextual_metadata"]["confidence"] == 0.8

            # Verify services were called
            mock_ai.refine_text.assert_called_once()
            mock_ai.refine_with_context.assert_called_once()
            mock_tts.synthesize_speech.assert_called_once()

    @pytest.mark.asyncio
    async def test_process_slide_handles_failure(self, orchestrator):
        """Test that slide processing failures are handled gracefully."""
        slide = SlideContent(
            slide_id="test_slide",
            title="Test Slide",
            content="This is a test slide for processing.",
        )

        # Mock service to raise an exception
        with patch.object(orchestrator, 'ai_refinement_service') as mock_ai:
            mock_ai.refine_text = AsyncMock(side_effect=Exception("AI service failed"))

        result = await orchestrator.process_slide("test_job", slide, 1, tts_options={})

            assert result["status"] == "failed"
            assert result["slide_id"] == "test_slide"
            assert "error" in result
            assert "AI service failed" in result["error"]

    @pytest.mark.asyncio
    async def test_process_slide_with_image_analysis(self, orchestrator):
        """Ensure image analysis populates slide image metadata."""
        slide = SlideContent(
            slide_id="slide_images",
            title="Product Overview",
            content="Showcase of the latest product and its specifications.",
            images=[ImageData(image_id="img-1")],
        )

        orchestrator.image_analysis_service = MagicMock()
        orchestrator.image_analysis_service.analyze_slide_images = AsyncMock(
            return_value=ImageAnalysisResponse(
                results=[
                    ImageAnalysisResult(
                        image_id="img-1",
                        analysis=ImageAnalysis(
                            caption="Product photo highlighting the device",
                            confidence=0.9,
                            tags=["product", "device"],
                            objects=["device"],
                        ),
                    )
                ],
                processing_time=0.01,
            )
        )

        with patch.object(orchestrator, "ai_refinement_service") as mock_ai, patch.object(
            orchestrator, "tts_service"
        ) as mock_tts:
            mock_ai.refine_text = AsyncMock(return_value=MagicMock(refined_text="Refined content"))
            mock_ai.refine_with_context = AsyncMock(
                return_value=RefinedScript(
                    text="Refined content",
                    highlights=["Refined content"],
                    image_references=["Product photo highlighting the device"],
                    transitions={},
                    confidence=0.85,
                )
            )
            mock_tts.synthesize_speech = AsyncMock(
                return_value=TTSResponse(
                    audio_url="/media/test/audio.wav",
                    duration=4.5,
                    file_size=512000,
                    voice_used="en-US-AriaNeural",
                    processing_time=1.2,
                )
            )

            result = await orchestrator.process_slide("job-image", slide, 1, tts_options={})

            assert result["status"] == "completed"
            assert slide.images[0].analysis is not None
            assert "product" in slide.images[0].analysis.tags
            orchestrator.image_analysis_service.analyze_slide_images.assert_awaited()

    @pytest.mark.asyncio
    async def test_generate_slide_subtitles(self, orchestrator):
        """Test subtitle generation for slide content."""
        text = "This is a test slide with multiple words for subtitle generation."
        audio_result = TTSResponse(
            audio_url="/media/test/audio.wav",
            duration=10.0,
            file_size=1024000,
            voice_used="en-US-AriaNeural",
            processing_time=1.5,
        )

        subtitles = await orchestrator._generate_slide_subtitles(text, audio_result)

        assert isinstance(subtitles, list)
        assert len(subtitles) > 0

        # Check subtitle structure
        subtitle = subtitles[0]
        assert isinstance(subtitle, SubtitleEntry)
        assert subtitle.index == 1
        assert subtitle.start_time >= 0
        assert subtitle.end_time > subtitle.start_time
        assert len(subtitle.text) > 0

        # Check timing progression
        if len(subtitles) > 1:
            for i in range(1, len(subtitles)):
                assert subtitles[i].start_time >= subtitles[i-1].end_time

    @pytest.mark.asyncio
    async def test_get_job_status_existing_job(self, orchestrator):
        """Test getting status for an existing job."""
        # Create a job
        job_id = "test_job_123"
        job_data = {
            "job_id": job_id,
            "status": JobStatus.PROCESSING,
            "total_slides": 5,
            "current_slide": 2,
            "started_at": datetime.utcnow().isoformat(),
        }
        orchestrator.cache.set(f"job:{job_id}", job_data, ttl_seconds=3600)

        status = await orchestrator.get_job_status(job_id)

        assert status is not None
        assert status["job_id"] == job_id
        assert status["status"] == JobStatus.PROCESSING
        assert status["total_slides"] == 5
        assert status["current_slide"] == 2

    @pytest.mark.asyncio
    async def test_get_job_status_nonexistent_job(self, orchestrator):
        """Test getting status for a non-existent job."""
        status = await orchestrator.get_job_status("nonexistent_job")

        assert status is None

    @pytest.mark.asyncio
    async def test_cancel_job_queued(self, orchestrator):
        """Test cancelling a queued job."""
        job_id = "test_job_123"
        job_data = {
            "job_id": job_id,
            "status": JobStatus.QUEUED,
            "total_slides": 5,
            "started_at": datetime.utcnow().isoformat(),
        }
        orchestrator.cache.set(f"job:{job_id}", job_data, ttl_seconds=3600)

        cancelled = await orchestrator.cancel_job(job_id)

        assert cancelled is True

        # Verify job status was updated
        updated_job = orchestrator.cache.get(f"job:{job_id}")
        assert updated_job["status"] == JobStatus.FAILED

    @pytest.mark.asyncio
    async def test_cancel_job_completed(self, orchestrator):
        """Test that completed jobs cannot be cancelled."""
        job_id = "test_job_123"
        job_data = {
            "job_id": job_id,
            "status": JobStatus.COMPLETED,
            "total_slides": 5,
            "started_at": datetime.utcnow().isoformat(),
        }
        orchestrator.cache.set(f"job:{job_id}", job_data, ttl_seconds=3600)

        cancelled = await orchestrator.cancel_job(job_id)

        assert cancelled is False

    @pytest.mark.asyncio
    async def test_update_progress(self, orchestrator):
        """Test progress updates for jobs."""
        job_id = "test_job_123"
        job_data = {
            "job_id": job_id,
            "status": JobStatus.PROCESSING,
            "total_slides": 4,
            "current_slide": 0,
            "started_at": datetime.utcnow().isoformat(),
        }
        orchestrator.cache.set(f"job:{job_id}", job_data, ttl_seconds=3600)

        await orchestrator._update_progress(
            job_id=job_id,
            step=ProcessingStep.SYNTHESIS,
            current_slide=2,
            progress=0.5,
            message="Processing slide 2 of 4",
            slide_result={
                "slide_id": "slide-2",
                "contextual_metadata": {
                    "highlights": ["Key point"],
                    "image_references": ["Image reference"],
                    "transitions": {"position": "Slide 2 of 4"},
                    "confidence": 0.8,
                },
            },
        )

        # Check progress was stored
        progress_data = orchestrator.cache.get(f"progress:{job_id}")
        assert progress_data is not None
        assert progress_data["job_id"] == job_id
        assert progress_data["current_step"] == ProcessingStep.SYNTHESIS
        assert progress_data["current_slide"] == 2
        assert progress_data["total_slides"] == 4
        assert progress_data["progress"] == 0.5
        assert progress_data["message"] == "Processing slide 2 of 4"
        assert progress_data["slide_result"]["slide_id"] == "slide-2"
        assert progress_data["slide_result"]["contextual_metadata"]["confidence"] == 0.8


class TestNarrationAPI:
    """Test cases for the narration service API endpoints."""

    def test_health_check(self, client):
        """Test the health check endpoint."""
        response = client.get("/health")
        assert response.status_code == 200

        data = response.json()
        assert data["success"] is True
        assert "Narration Service is healthy" in data["message"]

    def test_process_presentation_success(self, client, sample_presentation):
        """Test successful presentation processing request."""
        with patch('services.narration.app.orchestrator.process_presentation', new_callable=AsyncMock) as mock_process:
            mock_process.return_value = "test_job_123"

            response = client.post(
                "/process-presentation",
                json=sample_presentation.model_dump(),
                headers={"Authorization": "Bearer test_token"}
            )

            assert response.status_code == 200

            data = response.json()
            assert data["job_id"] == "test_job_123"
            assert data["status"] == "queued"
            assert data["total_slides"] == len(sample_presentation.slides)
            assert "message" in data

            mock_process.assert_called_once_with(sample_presentation)

    def test_process_presentation_empty_slides(self, client):
        """Test processing presentation with no slides."""
        empty_presentation = PresentationRequest(slides=[])

        response = client.post(
            "/process-presentation",
            json=empty_presentation.model_dump(),
            headers={"Authorization": "Bearer test_token"}
        )

        assert response.status_code == 400
        assert "must contain at least one slide" in response.json()["detail"]

    def test_process_slide_success(self, client):
        """Test successful single slide processing."""
        slide_data = {
            "presentation_id": "test_presentation",
            "slide_id": "test_slide",
            "slide_content": "This is a test slide.",
            "slide_number": 1,
        }

        with patch('services.narration.app.orchestrator.process_slide', new_callable=AsyncMock) as mock_process:
            mock_result = {
                "slide_number": 1,
                "slide_id": "test_slide",
                "status": "completed",
                "refined_content": "Refined content",
            }
            mock_process.return_value = mock_result

            response = client.post(
                "/process-slide",
                json=slide_data,
                headers={"Authorization": "Bearer test_token"}
            )

            assert response.status_code == 200

            data = response.json()
            assert data["slide_id"] == "test_slide"
            assert data["slide_number"] == 1
            assert data["status"] == "completed"
            assert "result" in data

    def test_get_job_status_success(self, client):
        """Test getting job status successfully."""
        with patch('services.narration.app.orchestrator.get_job_status', new_callable=AsyncMock) as mock_status:
            mock_status.return_value = {
                "job_id": "test_job_123",
                "status": "processing",
                "progress": 0.5,
                "current_slide": 2,
                "total_slides": 4,
            }

            response = client.get(
                "/status/test_job_123",
                headers={"Authorization": "Bearer test_token"}
            )

            assert response.status_code == 200

            data = response.json()
            assert data["job_id"] == "test_job_123"
            assert data["status"] == "processing"
            assert data["progress"] == 0.5
            assert data["current_slide"] == 2
            assert data["total_slides"] == 4

    def test_get_job_status_not_found(self, client):
        """Test getting status for non-existent job."""
        with patch('services.narration.app.orchestrator.get_job_status', new_callable=AsyncMock) as mock_status:
            mock_status.return_value = None

            response = client.get(
                "/status/nonexistent_job",
                headers={"Authorization": "Bearer test_token"}
            )

            assert response.status_code == 404
            assert "not found" in response.json()["detail"]

    def test_get_manifest_success(self, client, tmp_path, monkeypatch):
        job_id = "job-manifest"
        manifest_dir = tmp_path / job_id
        manifest_dir.mkdir(parents=True)
        manifest_path = manifest_dir / "manifest.json"
        manifest_payload = {"job_id": job_id, "slides": [{"slide_id": "slide-1"}]}
        manifest_path.write_text(json.dumps(manifest_payload), encoding="utf-8")

        monkeypatch.setattr('services.narration.app.orchestrator.media_root', tmp_path)

        response = client.get(
            f"/manifest/{job_id}",
            headers={"Authorization": "Bearer test_token"}
        )

        assert response.status_code == 200
        assert response.json()["job_id"] == job_id

    def test_get_manifest_not_found(self, client, tmp_path, monkeypatch):
        monkeypatch.setattr('services.narration.app.orchestrator.media_root', tmp_path)

        response = client.get(
            "/manifest/missing",
            headers={"Authorization": "Bearer test_token"}
        )

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_contextual_pipeline_disabled_skips_context(self, orchestrator, monkeypatch):
        from shared.config import config as service_config

        monkeypatch.setattr(
            service_config,
            "pipeline_config",
            {"pipelines": {"contextual_refinement": {"enabled": False}}},
        )

        slide = SlideContent(slide_id="slide-disabled", content="Content", notes="Notes")

        with patch.object(orchestrator, "ai_refinement_service") as mock_ai, \
             patch.object(orchestrator, "tts_service") as mock_tts, \
             patch.object(orchestrator, "image_analysis_service") as mock_image:

            mock_ai.refine_text = AsyncMock(return_value=MagicMock(refined_text="Base text"))
            mock_ai.refine_with_context = AsyncMock()
            mock_tts.synthesize_speech = AsyncMock(return_value=TTSResponse(
                audio_url="/media/audio.wav",
                duration=3.0,
                file_size=1000,
                voice_used="test",
                request_id="req-1",
                processing_time=1.0,
            ))
            mock_image.analyze_slide_images = AsyncMock()

            result = await orchestrator.process_slide("job-disabled", slide, 1, None, tts_options={})

            mock_ai.refine_with_context.assert_not_awaited()
            mock_image.analyze_slide_images.assert_not_awaited()
            assert "contextual_metadata" not in result

    @pytest.mark.asyncio
    async def test_contextual_pipeline_disables_image_analysis(self, orchestrator, monkeypatch):
        from shared.config import config as service_config

        monkeypatch.setattr(
            service_config,
            "pipeline_config",
            {"pipelines": {"contextual_refinement": {"enabled": True, "use_image_analysis": False}}},
        )

        slide = SlideContent(slide_id="slide-no-image", content="Content", notes="Notes")

        with patch.object(orchestrator, "ai_refinement_service") as mock_ai, \
             patch.object(orchestrator, "tts_service") as mock_tts, \
             patch.object(orchestrator, "image_analysis_service") as mock_image:

            mock_ai.refine_text = AsyncMock(return_value=MagicMock(refined_text="Base text"))
            mock_ai.refine_with_context = AsyncMock(return_value=RefinedScript(
                text="Refined with context",
                highlights=["Refined with context"],
                image_references=[],
                transitions={},
                confidence=0.7,
            ))
            mock_tts.synthesize_speech = AsyncMock(return_value=TTSResponse(
                audio_url="/media/audio.wav",
                duration=3.0,
                file_size=1000,
                voice_used="test",
                request_id="req-2",
                processing_time=1.0,
            ))
            mock_image.analyze_slide_images = AsyncMock()

            result = await orchestrator.process_slide("job-no-image", slide, 1, None, tts_options={})

            mock_image.analyze_slide_images.assert_not_awaited()
            mock_ai.refine_with_context.assert_awaited()
            assert result.get("contextual_metadata") is not None

    @pytest.mark.asyncio
    async def test_contextual_refinement_used_when_image_analysis_present(self, orchestrator):
        slide = SlideContent(
            slide_id="slide-context",
            title="Revenue Highlights",
            content="Revenue grew by 20% this quarter.",
            images=[
                ImageData(
                    image_id="img-1",
                    description="Revenue chart",
                    labels=["chart", "revenue"],
                    analysis=ImageAnalysis(
                        caption="Line chart showing revenue growth",
                        confidence=0.9,
                        tags=["chart"],
                        objects=["chart"],
                        callouts=["Narration cue: reference the chart while summarizing the growth."],
                    ),
                )
            ],
        )

        presentation = PresentationRequest(
            slides=[slide],
            metadata={"presentation_id": "deck-42", "keywords": ["revenue", "growth"]},
        )

        orchestrator.image_analysis_service = MagicMock()

        with patch.object(orchestrator, "ai_refinement_service") as mock_ai, patch.object(
            orchestrator, "tts_service"
        ) as mock_tts:
            mock_ai.refine_text = AsyncMock(
                return_value=MagicMock(refined_text="Revenue grew by 20% this quarter with strong momentum.")
            )
            mock_ai.refine_with_context = AsyncMock(
                return_value=RefinedScript(
                    text="Revenue grew by 20% this quarter — invite the audience to review the chart.",
                    highlights=["Emphasize the 20% growth"],
                    image_references=["Line chart showing revenue growth"],
                    transitions={},
                    confidence=0.82,
                )
            )
            mock_tts.synthesize_speech = AsyncMock(
                return_value=TTSResponse(
                    audio_url="/media/test/audio.wav",
                    duration=4.0,
                    file_size=512000,
                    voice_used="en-US-AriaNeural",
                    processing_time=1.0,
                )
            )

            result = await orchestrator.process_slide("job-context", slide, 1, presentation, tts_options={})

            mock_ai.refine_text.assert_awaited_once()
            mock_ai.refine_with_context.assert_awaited_once()
            assert result["status"] == "completed"
            assert result["refined_content"].startswith("Revenue grew by 20%")
            assert result["contextual_metadata"]["image_references"] == ["Line chart showing revenue growth"]

    @pytest.mark.asyncio
    async def test_image_analysis_placeholder_applied_when_results_missing(self, orchestrator):
        class EmptyAnalysisService:
            async def analyze_slide_images(self, request):  # type: ignore[no-untyped-def]
                return ImageAnalysisResponse(results=[], processing_time=0.0)

        orchestrator.image_analysis_service = EmptyAnalysisService()

        slide = SlideContent(
            slide_id="slide-placeholder",
            title="Product Overview",
            content="Outline of the product roadmap.",
            images=[
                ImageData(
                    image_id="img-1",
                    description=None,
                    alt_text="Product chart",
                    labels=[],
                    dominant_colors=["#FFFFFF"],
                    detected_objects=[],
                )
            ],
        )
        presentation = PresentationRequest(
            slides=[slide],
            metadata={"presentation_id": "deck-1", "keywords": ["roadmap"]},
        )

        await orchestrator._ensure_image_analysis(slide, presentation)
        analysis = slide.images[0].analysis

        assert analysis is not None
        assert analysis.raw_metadata.get("placeholder") is True
        assert analysis.caption
        assert "narration cue" in " ".join(analysis.callouts).lower()
        assert analysis.confidence == pytest.approx(0.05)

    def test_cancel_job_success(self, client):
        """Test successful job cancellation."""
        with patch('services.narration.app.orchestrator.cancel_job', new_callable=AsyncMock) as mock_cancel, \
             patch('services.narration.app.orchestrator.get_job_status', new_callable=AsyncMock) as mock_status:
            mock_cancel.return_value = True
            mock_status.return_value = {"status": "cancelled"}

            response = client.post(
                "/cancel/test_job_123",
                headers={"Authorization": "Bearer test_token"}
            )

            assert response.status_code == 200

            data = response.json()
            assert data["job_id"] == "test_job_123"
            assert data["cancelled"] is True
            assert "successfully" in data["message"]

    def test_export_presentation_success(self, client, sample_export_request):
        """Test successful presentation export."""
        response = client.post(
            "/export-presentation",
            json=sample_export_request.model_dump(),
            headers={"Authorization": "Bearer test_token"}
        )

        assert response.status_code == 200

        data = response.json()
        assert "export_id" in data
        assert data["export_format"] == ExportFormat.PPTX
        assert "download_url" in data
        assert "created_at" in data
        assert "expires_at" in data

    def test_list_jobs(self, client):
        """Test listing jobs with filters."""
        response = client.get(
            "/jobs?status=processing&limit=10&offset=0",
            headers={"Authorization": "Bearer test_token"}
        )

        assert response.status_code == 200

        data = response.json()
        assert "jobs" in data
        assert "total" in data
        assert "limit" in data
        assert "offset" in data
        assert data["limit"] == 10
        assert data["offset"] == 0

    def test_unauthorized_access(self, client, sample_presentation):
        """Test that endpoints require authentication."""
        response = client.post("/process-presentation", json=sample_presentation.model_dump())
        assert response.status_code == 401

        response = client.get("/status/test_job")
        assert response.status_code == 401

        response = client.post("/cancel/test_job")
        assert response.status_code == 401


class TestIntegration:
    """Integration tests for the narration service."""

    @pytest.mark.asyncio
    async def test_end_to_end_processing(self, orchestrator, sample_presentation):
        """Test end-to-end presentation processing."""
        # Mock external dependencies
        with patch.object(orchestrator, 'ai_refinement_service') as mock_ai, \
             patch.object(orchestrator, 'tts_service') as mock_tts, \
             patch.object(orchestrator.queue_manager, 'enqueue', new_callable=AsyncMock) as mock_enqueue:

            # Mock AI service
            mock_ai.refine_text = AsyncMock(return_value=MagicMock(
                refined_text="Refined content for testing."
            ))
            mock_ai.refine_with_context = AsyncMock(return_value=RefinedScript(
                text="Refined content for testing.",
                highlights=["Refined content for testing."],
                image_references=[],
                transitions={},
                confidence=0.75,
            ))

            # Mock TTS service
            mock_tts.synthesize_speech = AsyncMock(return_value=TTSResponse(
                audio_url="/media/test/audio.wav",
                duration=5.0,
                file_size=1024000,
                voice_used="en-US-AriaNeural",
                processing_time=1.5,
            ))

            # Start processing
            job_id = await orchestrator.process_presentation(sample_presentation)
            assert job_id is not None

            # Process first slide
            slide_result = await orchestrator.process_slide(
                job_id, sample_presentation.slides[0], 1, tts_options={}
            )
            assert slide_result["status"] == "completed"

            # Check job status
            status = await orchestrator.get_job_status(job_id)
            assert status is not None
            assert status["status"] in [JobStatus.QUEUED, JobStatus.PROCESSING]

            # Cancel job
            cancelled = await orchestrator.cancel_job(job_id)
            assert cancelled is True

            # Verify cancellation
            final_status = await orchestrator.get_job_status(job_id)
            assert final_status["status"] == JobStatus.FAILED


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
