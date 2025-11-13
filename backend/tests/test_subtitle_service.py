"""Tests for the subtitle service."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from services.subtitles.generator import SubtitleGenerator
from services.subtitles.app import app
from shared.models import SubtitleEntry, SubtitleRequest
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    """Test client for the subtitle service."""
    return TestClient(app)


@pytest.fixture
def generator():
    """Subtitle generator instance for testing."""
    return SubtitleGenerator()


@pytest.fixture
def sample_subtitle_request():
    """Sample subtitle request for testing."""
    return SubtitleRequest(
        text="This is a sample text for subtitle generation. It contains multiple sentences for testing purposes.",
        language="en-US",
        max_chars_per_line=50,
        max_lines_per_subtitle=2,
    )


@pytest.fixture
def sample_subtitles():
    """Sample subtitle entries for testing."""
    return [
        SubtitleEntry(
            index=1,
            start_time=0.0,
            end_time=3.0,
            text="This is the first subtitle entry.",
        ),
        SubtitleEntry(
            index=2,
            start_time=3.5,
            end_time=6.5,
            text="This is the second subtitle entry.",
        ),
    ]


class TestSubtitleGenerator:
    """Test cases for the SubtitleGenerator class."""

    def test_generator_initialization(self, generator):
        """Test that the subtitle generator initializes correctly."""
        assert generator is not None
        assert generator.max_chars_per_line > 0
        assert generator.max_lines_per_subtitle > 0
        assert generator.min_subtitle_duration > 0
        assert generator.max_subtitle_duration > 0

    @pytest.mark.asyncio
    async def test_generate_from_text_only(self, generator):
        """Test subtitle generation from text only."""
        text = "This is a test text for subtitle generation."
        estimated_duration = 10.0

        subtitles = await generator.generate_from_text_only(text, estimated_duration)

        assert isinstance(subtitles, list)
        assert len(subtitles) > 0

        # Check subtitle structure
        subtitle = subtitles[0]
        assert isinstance(subtitle, SubtitleEntry)
        assert subtitle.index >= 1
        assert subtitle.start_time >= 0
        assert subtitle.end_time > subtitle.start_time
        assert len(subtitle.text) > 0

        # Check timing progression
        if len(subtitles) > 1:
            for i in range(1, len(subtitles)):
                assert subtitles[i].start_time >= subtitles[i-1].end_time

    @pytest.mark.asyncio
    async def test_sync_with_slides(self, generator, sample_subtitles):
        """Test subtitle synchronization with slides."""
        slide_duration = 8.0
        slide_number = 1

        synced_subtitles = await generator.sync_with_slides(
            sample_subtitles, slide_duration, slide_number
        )

        assert isinstance(synced_subtitles, list)
        assert len(synced_subtitles) == len(sample_subtitles)

        # Check that all subtitles fit within slide duration
        if synced_subtitles:
            assert synced_subtitles[-1].end_time <= slide_duration + 0.1  # Small tolerance

    def test_convert_to_srt(self, generator, sample_subtitles):
        """Test conversion to SRT format."""
        srt_content = generator.convert_to_srt(sample_subtitles)

        assert isinstance(srt_content, str)
        assert len(srt_content) > 0

        # Check SRT format structure
        lines = srt_content.split('\n')
        assert "1" in lines  # First subtitle index
        assert any("-->" in line for line in lines)
        assert "This is the first subtitle entry." in srt_content

    def test_convert_to_vtt(self, generator, sample_subtitles):
        """Test conversion to WebVTT format."""
        vtt_content = generator.convert_to_vtt(sample_subtitles)

        assert isinstance(vtt_content, str)
        assert len(vtt_content) > 0

        # Check WebVTT format structure
        lines = vtt_content.split('\n')
        assert "WEBVTT" in lines  # WebVTT header
        assert any("-->" in line for line in lines)
        assert "This is the first subtitle entry." in vtt_content

    def test_seconds_to_srt_time(self, generator):
        """Test time conversion to SRT format."""
        # Test basic conversion
        srt_time = generator._seconds_to_srt_time(3661.123)
        assert srt_time == "01:01:01,123"

        # Test zero time
        srt_time = generator._seconds_to_srt_time(0.0)
        assert srt_time == "00:00:00,000"

    def test_seconds_to_vtt_time(self, generator):
        """Test time conversion to WebVTT format."""
        # Test basic conversion
        vtt_time = generator._seconds_to_vtt_time(3661.123)
        assert vtt_time == "01:01:01.123"

        # Test zero time
        vtt_time = generator._seconds_to_vtt_time(0.0)
        assert vtt_time == "00:00:00.000"

    def test_ensure_minimum_spacing(self, generator):
        """Test minimum spacing between subtitles."""
        subtitles = [
            SubtitleEntry(index=1, start_time=0.0, end_time=2.0, text="First"),
            SubtitleEntry(index=2, start_time=2.05, end_time=4.0, text="Second"),  # Only 0.05s gap
            SubtitleEntry(index=3, start_time=4.5, end_time=6.0, text="Third"),
        ]

        adjusted = generator._ensure_minimum_spacing(subtitles, min_spacing=0.1)

        # Check that minimum spacing is maintained
        assert adjusted[1].start_time - adjusted[0].end_time >= 0.1
        assert adjusted[2].start_time - adjusted[1].end_time >= 0.1

    def test_apply_formatting_rules(self, generator):
        """Test subtitle formatting rules."""
        subtitle = SubtitleEntry(
            index=1,
            start_time=0.0,
            end_time=0.5,  # Too short
            text="test subtitle",
        )

        formatted = generator._apply_formatting_rules([subtitle])

        # Check that minimum duration is enforced
        assert formatted[0].end_time - formatted[0].start_time >= generator.min_subtitle_duration


class TestSubtitleAPI:
    """Test cases for the subtitle service API endpoints."""

    def test_health_check(self, client):
        """Test the health check endpoint."""
        response = client.get("/health")
        assert response.status_code == 200

        data = response.json()
        assert data["success"] is True
        assert "Subtitle Service is healthy" in data["message"]

    def test_generate_subtitles_text_only(self, client, sample_subtitle_request):
        """Test subtitle generation with text only."""
        response = client.post(
            "/generate",
            json=sample_subtitle_request.model_dump(),
            headers={"Authorization": "Bearer test_token"}
        )

        assert response.status_code == 200

        data = response.json()
        assert "subtitles" in data
        assert "total_duration" in data
        assert "processing_time" in data
        assert isinstance(data["subtitles"], list)

    def test_sync_subtitles_with_slides(self, client, sample_subtitles):
        """Test subtitle synchronization endpoint."""
        request_data = {
            "subtitles": [sub.model_dump() for sub in sample_subtitles],
            "slide_duration": 10.0,
            "slide_number": 1,
        }

        response = client.post(
            "/sync-with-slides",
            json=request_data,
            headers={"Authorization": "Bearer test_token"}
        )

        assert response.status_code == 200

        data = response.json()
        assert isinstance(data, list)
        assert len(data) == len(sample_subtitles)

    def test_convert_subtitle_format(self, client, sample_subtitles):
        """Test subtitle format conversion endpoint."""
        request_data = {
            "subtitles": [sub.model_dump() for sub in sample_subtitles],
            "target_format": "srt",
        }

        response = client.post(
            "/convert-format",
            json=request_data,
            headers={"Authorization": "Bearer test_token"}
        )

        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/")

        srt_content = response.text
        assert "WEBVTT" not in srt_content  # Should be SRT, not VTT
        assert "-->" in srt_content  # Should have timing

    def test_convert_subtitle_format_vtt(self, client, sample_subtitles):
        """Test subtitle format conversion to WebVTT."""
        request_data = {
            "subtitles": [sub.model_dump() for sub in sample_subtitles],
            "target_format": "vtt",
        }

        response = client.post(
            "/convert-format",
            json=request_data,
            headers={"Authorization": "Bearer test_token"}
        )

        assert response.status_code == 200
        assert "text/vtt" in response.headers["content-type"]

        vtt_content = response.text
        assert "WEBVTT" in vtt_content  # Should start with WEBVTT
        assert "-->" in vtt_content  # Should have timing

    def test_validate_subtitles(self, client, sample_subtitles):
        """Test subtitle validation endpoint."""
        request_data = {
            "subtitles": [sub.model_dump() for sub in sample_subtitles],
        }

        response = client.post(
            "/validate",
            json=request_data,
            headers={"Authorization": "Bearer test_token"}
        )

        assert response.status_code == 200

        data = response.json()
        assert "valid" in data
        assert "issues" in data
        assert "warnings" in data
        assert "statistics" in data
        assert data["statistics"]["total_subtitles"] == len(sample_subtitles)

    def test_validate_invalid_subtitles(self, client):
        """Test subtitle validation with invalid data."""
        invalid_subtitles = [
            {
                "index": 1,
                "start_time": 5.0,  # Start after end
                "end_time": 3.0,
                "text": "Invalid timing",
            }
        ]

        request_data = {"subtitles": invalid_subtitles}

        response = client.post(
            "/validate",
            json=request_data,
            headers={"Authorization": "Bearer test_token"}
        )

        assert response.status_code == 200

        data = response.json()
        assert data["valid"] is False
        assert len(data["issues"]) > 0
        assert "Start time must be before end time" in data["issues"][0]

    def test_get_supported_formats(self, client):
        """Test getting supported subtitle formats."""
        response = client.get(
            "/formats",
            headers={"Authorization": "Bearer test_token"}
        )

        assert response.status_code == 200

        data = response.json()
        assert "formats" in data
        assert "default_format" in data

        # Check that SRT and VTT are supported
        format_names = [f["name"] for f in data["formats"]]
        assert "SRT" in format_names
        assert "WebVTT" in format_names

    def test_get_subtitle_config(self, client):
        """Test getting subtitle configuration."""
        response = client.get(
            "/config",
            headers={"Authorization": "Bearer test_token"}
        )

        assert response.status_code == 200

        data = response.json()
        assert "max_chars_per_line" in data
        assert "max_lines_per_subtitle" in data
        assert "min_subtitle_duration" in data
        assert "max_subtitle_duration" in data
        assert "stt_provider" in data

    def test_unauthorized_access(self, client, sample_subtitle_request):
        """Test that endpoints require authentication."""
        response = client.post("/generate", json=sample_subtitle_request.model_dump())
        assert response.status_code == 401

        response = client.get("/formats")
        assert response.status_code == 401

        response = client.post("/validate", json={"subtitles": []})
        assert response.status_code == 401


class TestIntegration:
    """Integration tests for the subtitle service."""

    @pytest.mark.asyncio
    async def test_end_to_end_subtitle_workflow(self, generator):
        """Test complete subtitle generation workflow."""
        text = "Welcome to this presentation. Today we will discuss the future of AI technology and its impact on society."

        # Step 1: Generate subtitles from text
        subtitles = await generator.generate_from_text_only(text, estimated_duration=15.0)
        assert len(subtitles) > 0

        # Step 2: Sync with slide timing
        synced_subtitles = await generator.sync_with_slides(subtitles, slide_duration=12.0, slide_number=1)
        assert len(synced_subtitles) == len(subtitles)

        # Step 3: Convert to SRT format
        srt_content = generator.convert_to_srt(synced_subtitles)
        assert len(srt_content) > 0
        assert "-->" in srt_content

        # Step 4: Convert to WebVTT format
        vtt_content = generator.convert_to_vtt(synced_subtitles)
        assert len(vtt_content) > 0
        assert "WEBVTT" in vtt_content

    @pytest.mark.asyncio
    async def test_fallback_subtitle_generation(self, generator):
        """Test fallback subtitle generation when STT fails."""
        text = "This is a test for fallback subtitle generation when speech-to-text services are unavailable."

        # Mock audio data that would cause STT to fail
        audio_data = b"fake_audio_data"

        with patch.object(generator, '_get_word_timings', return_value=[]):
            subtitles = await generator.generate_from_audio(audio_data, text)

            # Should generate fallback subtitles
            assert isinstance(subtitles, list)
            assert len(subtitles) > 0

            # Check that subtitles have proper timing
            for subtitle in subtitles:
                assert subtitle.start_time < subtitle.end_time
                assert len(subtitle.text) > 0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
