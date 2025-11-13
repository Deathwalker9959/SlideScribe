"""
End-to-End Workflow Tests
Tests the complete narration generation workflow from slide extraction to audio embedding
"""

import json
import pytest
import asyncio
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app import app
from services.narration.orchestrator import NarrationOrchestrator
from services.websocket_progress import WebSocketProgressManager
from shared.models import (
    NarrationRequest,
    NarrationResponse,
    JobStatus,
    ExportRequest,
    ExportResponse
)
from shared.utils import setup_logging

# Disable logging for tests
setup_logging("test-e2e", log_level="CRITICAL")


class TestEndToEndWorkflow:
    """Test complete narration generation workflow."""

    @pytest.fixture
    def client(self):
        return TestClient(app)

    @pytest.fixture
    def mock_powerpoint_slides(self):
        """Mock PowerPoint slide data."""
        return [
            {
                "id": "slide-1",
                "title": "Introduction",
                "content": "Welcome to our presentation about AI and machine learning. Today we'll explore the latest developments in natural language processing.",
                "notes": "",
                "layout": "Title and Content",
                "slide_number": 1
            },
            {
                "id": "slide-2",
                "title": "What is AI?",
                "content": "Artificial Intelligence is the simulation of human intelligence in machines. It encompasses machine learning, neural networks, and deep learning.",
                "notes": "Emphasize the difference between narrow and general AI",
                "layout": "Two Content",
                "slide_number": 2
            },
            {
                "id": "slide-3",
                "title": "Machine Learning Applications",
                "content": "Machine learning is used in: healthcare diagnosis, financial fraud detection, recommendation systems, autonomous vehicles, and natural language translation.",
                "notes": "",
                "layout": "Comparison",
                "slide_number": 3
            }
        ]

    @pytest.fixture
    def mock_auth_token(self):
        """Mock JWT token for authentication."""
        return "Bearer mock-jwt-token-for-testing"

    @pytest.fixture
    def websocket_manager(self):
        """WebSocket manager for real-time updates."""
        return WebSocketProgressManager()

    @pytest.mark.asyncio
    async def test_complete_narration_workflow(self, client, mock_powerpoint_slides, mock_auth_token, websocket_manager):
        """Test the complete workflow from slide extraction to audio generation."""

        # Step 1: Extract slides from PowerPoint
        with patch('services.narration.orchestrator.extract_slides_from_powerpoint') as mock_extract:
            mock_extract.return_value = mock_powerpoint_slides

            # Step 2: Initialize narration job
            narration_request = NarrationRequest(
                presentation_id="test-presentation-123",
                slides=mock_powerpoint_slides,
                voice_settings={
                    "voice": "en-US-AriaNeural",
                    "language": "en-US",
                    "speed": 1.0,
                    "pitch": 0,
                    "style": "friendly"
                },
                refinement_settings={
                    "enabled": True,
                    "style": "professional",
                    "complexity": "medium",
                    "tone": "neutral"
                },
                output_settings={
                    "format": "mp3",
                    "quality": "high",
                    "sample_rate": 22050
                }
            )

            # Create narration job
            response = client.post(
                "/api/v1/narration/start",
                json=narration_request.dict(),
                headers={"Authorization": mock_auth_token}
            )

            assert response.status_code == 200
            job_data = response.json()
            job_id = job_data["job_id"]
            assert job_id is not None

            # Step 3: Simulate real-time progress updates
            progress_updates = [
                {"status": "extracting", "progress": 0.1, "message": "Extracting slides"},
                {"status": "refining", "progress": 0.3, "message": "Refining slide scripts"},
                {"status": "synthesizing", "progress": 0.6, "message": "Generating audio"},
                {"status": "generating-subtitles", "progress": 0.8, "message": "Creating subtitles"},
                {"status": "processing", "progress": 0.9, "message": "Finalizing output"},
                {"status": "completed", "progress": 1.0, "message": "Narration complete"}
            ]

            # Simulate WebSocket progress updates
            for i, update in enumerate(progress_updates):
                progress_data = {
                    "job_id": job_id,
                    "timestamp": datetime.now().isoformat(),
                    **update
                }
                await websocket_manager.send_progress_update(job_id, progress_data)

                # Add small delay to simulate real processing
                await asyncio.sleep(0.01)

            # Step 4: Verify job completion
            response = client.get(
                f"/api/v1/narration/status/{job_id}",
                headers={"Authorization": mock_auth_token}
            )

            assert response.status_code == 200
            status_data = response.json()
            assert status_data["status"] == "completed"
            assert status_data["progress"] == 1.0

            # Step 5: Verify generated content
            response = client.get(
                f"/api/v1/narration/results/{job_id}",
                headers={"Authorization": mock_auth_token}
            )

            assert response.status_code == 200
            results = response.json()

            # Check that all slides have generated scripts
            assert len(results["slide_scripts"]) == len(mock_powerpoint_slides)

            # Check that audio files were generated
            assert len(results["audio_exports"]) == len(mock_powerpoint_slides)

            # Check subtitle generation
            assert "subtitles" in results
            assert len(results["subtitles"]) == len(mock_powerpoint_slides)

    @pytest.mark.asyncio
    async def test_error_recovery_workflow(self, client, mock_powerpoint_slides, mock_auth_token):
        """Test error handling and recovery during narration generation."""

        # Create narration request
        narration_request = NarrationRequest(
            presentation_id="error-test-presentation",
            slides=mock_powerpoint_slides,
            voice_settings={"voice": "en-US-AriaNeural", "language": "en-US"},
            refinement_settings={"enabled": True},
            output_settings={"format": "mp3"}
        )

        # Mock TTS service failure
        with patch('services.tts_service.service.TTSService.synthesize') as mock_tts:
            mock_tts.side_effect = Exception("TTS service temporarily unavailable")

            # Start narration (should handle TTS failure gracefully)
            response = client.post(
                "/api/v1/narration/start",
                json=narration_request.dict(),
                headers={"Authorization": mock_auth_token}
            )

            # Should still create job but mark with degraded status
            assert response.status_code == 200
            job_data = response.json()
            job_id = job_data["job_id"]

            # Verify job has error status but fallback was attempted
            response = client.get(
                f"/api/v1/narration/status/{job_id}",
                headers={"Authorization": mock_auth_token}
            )

            assert response.status_code == 200
            status_data = response.json()
            assert status_data["status"] in ["failed", "degraded"]
            assert "error" in status_data

    @pytest.mark.asyncio
    async def test_concurrent_job_processing(self, client, mock_powerpoint_slides, mock_auth_token):
        """Test processing multiple narration jobs concurrently."""

        # Create multiple presentation requests
        presentations = [
            {
                "id": f"concurrent-presentation-{i}",
                "slides": [slide.copy() for slide in mock_powerpoint_slides]
            }
            for i in range(3)
        ]

        # Start multiple jobs concurrently
        job_ids = []
        for presentation in presentations:
            narration_request = NarrationRequest(
                presentation_id=presentation["id"],
                slides=presentation["slides"],
                voice_settings={"voice": "en-US-AriaNeural", "language": "en-US"},
                refinement_settings={"enabled": True},
                output_settings={"format": "mp3"}
            )

            response = client.post(
                "/api/v1/narration/start",
                json=narration_request.dict(),
                headers={"Authorization": mock_auth_token}
            )

            assert response.status_code == 200
            job_ids.append(response.json()["job_id"])

        # Verify all jobs were created and are processing
        assert len(job_ids) == 3
        assert len(set(job_ids)) == 3  # All unique

        # Check that jobs can be queried independently
        for job_id in job_ids:
            response = client.get(
                f"/api/v1/narration/status/{job_id}",
                headers={"Authorization": mock_auth_token}
            )

            assert response.status_code == 200
            status_data = response.json()
            assert "status" in status_data
            assert "progress" in status_data

    @pytest.mark.asyncio
    async def test_export_workflow(self, client, mock_powerpoint_slides, mock_auth_token):
        """Test the export workflow after narration completion."""

        # Complete a narration job first
        narration_request = NarrationRequest(
            presentation_id="export-test-presentation",
            slides=mock_powerpoint_slides,
            voice_settings={"voice": "en-US-AriaNeural", "language": "en-US"},
            refinement_settings={"enabled": True},
            output_settings={"format": "mp3"}
        )

        # Start and complete narration
        response = client.post(
            "/api/v1/narration/start",
            json=narration_request.dict(),
            headers={"Authorization": mock_auth_token}
        )

        job_id = response.json()["job_id"]

        # Mock job completion
        with patch('services.narration.orchestrator.NarrationOrchestrator.get_job_status') as mock_status:
            mock_status.return_value = {
                "status": "completed",
                "progress": 1.0,
                "results": {
                    "slide_scripts": [{"slide_id": f"slide-{i}", "script": f"Script for slide {i}"} for i in range(3)],
                    "audio_exports": [{"slide_id": f"slide-{i}", "audio_url": f"http://example.com/audio-{i}.mp3"} for i in range(3)],
                    "subtitles": [{"slide_id": f"slide-{i}", "subtitle": f"Subtitle {i}"} for i in range(3)]
                }
            }

            # Test export to PowerPoint
            export_request = ExportRequest(
                job_id=job_id,
                export_format="pptx",
                include_audio=True,
                include_subtitles=True,
                embed_options={
                    "audio_shape_name": "SlideScribeNarration",
                    "subtitle_position": "bottom"
                }
            )

            response = client.post(
                "/api/v1/narration/export",
                json=export_request.dict(),
                headers={"Authorization": mock_auth_token}
            )

            assert response.status_code == 200
            export_data = response.json()

            assert "export_id" in export_data
            assert "download_url" in export_data
            assert "file_size" in export_data
            assert export_data["export_format"] == "pptx"

    @pytest.mark.asyncio
    async def test_voice_profile_workflow(self, client, mock_powerpoint_slides, mock_auth_token):
        """Test voice profile creation and application workflow."""

        # Create a custom voice profile
        voice_profile_data = {
            "name": "Professor Johnson",
            "voice": "en-US-GuyNeural",
            "language": "en-US",
            "speed": 0.9,
            "pitch": 5,
            "style": "professional",
            "emphasis": {
                "speed_variation": 0.1,
                "pause_duration": 0.5,
                "emphasis_words": ["important", "critical", "essential"]
            },
            "pronunciation": {
                "AI": "Artificial Intelligence",
                "ML": "Machine Learning"
            }
        }

        response = client.post(
            "/api/v1/voice-profiles",
            json=voice_profile_data,
            headers={"Authorization": mock_auth_token}
        )

        assert response.status_code == 201
        profile_data = response.json()
        profile_id = profile_data["id"]

        # Use voice profile in narration
        narration_request = NarrationRequest(
            presentation_id="voice-profile-test",
            slides=mock_powerpoint_slides,
            voice_profile_id=profile_id,
            refinement_settings={"enabled": True},
            output_settings={"format": "mp3"}
        )

        response = client.post(
            "/api/v1/narration/start",
            json=narration_request.dict(),
            headers={"Authorization": mock_auth_token}
        )

        assert response.status_code == 200
        job_data = response.json()

        # Verify voice profile was applied
        assert "voice_profile" in job_data
        assert job_data["voice_profile"]["name"] == "Professor Johnson"

    @pytest.mark.asyncio
    async def test_analytics_integration_workflow(self, client, mock_powerpoint_slides, mock_auth_token):
        """Test analytics collection throughout the narration workflow."""

        narration_request = NarrationRequest(
            presentation_id="analytics-test-presentation",
            slides=mock_powerpoint_slides,
            voice_settings={"voice": "en-US-AriaNeural", "language": "en-US"},
            refinement_settings={"enabled": True},
            output_settings={"format": "mp3"}
        )

        # Start narration with analytics tracking
        response = client.post(
            "/api/v1/narration/start",
            json=narration_request.dict(),
            headers={"Authorization": mock_auth_token}
        )

        job_id = response.json()["job_id"]

        # Simulate user interactions for analytics
        interactions = [
            {"action": "preview", "timestamp": datetime.now().isoformat(), "slide_id": "slide-1"},
            {"action": "voice_change", "timestamp": datetime.now().isoformat(), "old_voice": "en-US-AriaNeural", "new_voice": "en-US-GuyNeural"},
            {"action": "edit_script", "timestamp": datetime.now().isoformat(), "slide_id": "slide-2"},
            {"action": "preview", "timestamp": datetime.now().isoformat(), "slide_id": "slide-2"},
        ]

        # Record interactions
        for interaction in interactions:
            response = client.post(
                f"/api/v1/analytics/interactions/{job_id}",
                json=interaction,
                headers={"Authorization": mock_auth_token}
            )
            assert response.status_code == 200

        # Complete the job
        completion_data = {
            "job_id": job_id,
            "status": "completed",
            "total_duration_ms": 45000,
            "slides_processed": len(mock_powerpoint_slides),
            "characters_generated": 1500,
            "synthesis_provider": "azure",
            "refinement_enabled": True,
            "export_formats": ["mp3", "srt"],
            "user_interactions": interactions
        }

        response = client.post(
            "/api/v1/analytics/job-completion",
            json=completion_data,
            headers={"Authorization": mock_auth_token}
        )

        assert response.status_code == 200

        # Verify analytics were recorded
        response = client.get(
            f"/api/v1/analytics/job/{job_id}",
            headers={"Authorization": mock_auth_token}
        )

        assert response.status_code == 200
        analytics_data = response.json()

        assert "metrics" in analytics_data
        assert analytics_data["metrics"]["total_slides"] == len(mock_powerpoint_slides)
        assert analytics_data["metrics"]["preview_count"] == 2
        assert analytics_data["metrics"]["voice_changes"] == 1
        assert analytics_data["metrics"]["edit_count"] == 1

    def test_validation_workflow(self, client, mock_auth_token):
        """Test input validation throughout the workflow."""

        # Test invalid narration request
        invalid_request = {
            "presentation_id": "",  # Empty ID should fail validation
            "slides": [],  # Empty slides should fail
            "voice_settings": {},  # Missing required voice settings
        }

        response = client.post(
            "/api/v1/narration/start",
            json=invalid_request,
            headers={"Authorization": mock_auth_token}
        )

        assert response.status_code == 422  # Validation error

        # Test valid request with invalid voice settings
        invalid_voice_request = {
            "presentation_id": "test-presentation",
            "slides": mock_powerpoint_slides,
            "voice_settings": {
                "voice": "invalid-voice-name",  # Invalid voice
                "language": "invalid-lang",  # Invalid language
                "speed": 5.0,  # Speed out of range
            }
        }

        response = client.post(
            "/api/v1/narration/start",
            json=invalid_voice_request,
            headers={"Authorization": mock_auth_token}
        )

        assert response.status_code == 422

        # Test valid request structure
        valid_request = {
            "presentation_id": "validation-test",
            "slides": [
                {
                    "id": "slide-1",
                    "title": "Test Slide",
                    "content": "This is test content",
                    "slide_number": 1
                }
            ],
            "voice_settings": {
                "voice": "en-US-AriaNeural",
                "language": "en-US",
                "speed": 1.0,
                "pitch": 0
            },
            "refinement_settings": {
                "enabled": False
            },
            "output_settings": {
                "format": "mp3",
                "quality": "standard"
            }
        }

        response = client.post(
            "/api/v1/narration/start",
            json=valid_request,
            headers={"Authorization": mock_auth_token}
        )

        assert response.status_code == 200