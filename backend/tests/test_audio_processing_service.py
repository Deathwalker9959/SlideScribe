"""Tests for the audio processing service."""

from pathlib import Path

import pytest

from services.audio_processing.service import AudioProcessor
from shared.models import (
    AudioCombineRequest,
    AudioExportRequest,
    AudioSegment,
    AudioTransition,
    AudioTransitionRequest,
)


def _silent_segment(duration_seconds: float):
    return None


@pytest.mark.asyncio
async def test_combine_segments_generates_timeline(tmp_path, monkeypatch):
    processor = AudioProcessor()
    monkeypatch.setattr(processor, "media_root", tmp_path)

    request = AudioCombineRequest(
        job_id="job-audio",
        presentation_id="presentation-1",
        segments=[
            AudioSegment(slide_id="slide-1", file_path=str(tmp_path / "a1.wav"), duration=1.0),
            AudioSegment(slide_id="slide-2", file_path=str(tmp_path / "a2.wav"), duration=1.5),
        ],
        crossfade_duration_ms=200,
        padding_between_segments=0.1,
    )

    response = await processor.combine_segments(request)

    assert response.job_id == "job-audio"
    assert response.segment_count == 2
    assert response.timeline and response.timeline[0].slide_id == "slide-1"
    status = processor.get_job_status("job-audio")
    assert status["status"] == "combined"
    assert len(status["timeline"]) == 2


@pytest.mark.asyncio
async def test_apply_transitions_updates_state(tmp_path, monkeypatch):
    processor = AudioProcessor()
    monkeypatch.setattr(processor, "media_root", tmp_path)

    combine_request = AudioCombineRequest(
        job_id="job-transitions",
        presentation_id="presentation-1",
        segments=[
            AudioSegment(slide_id="slide-1", file_path=str(tmp_path / "slide1.wav"), duration=1.0),
            AudioSegment(slide_id="slide-2", file_path=str(tmp_path / "slide2.wav"), duration=1.2),
        ],
    )
    combine_response = await processor.combine_segments(combine_request)

    transition_request = AudioTransitionRequest(
        job_id="job-transitions",
        combined_audio_path=combine_response.output_path,
        transitions=[AudioTransition(from_slide="slide-1", to_slide="slide-2", duration=0.5)],
        normalize=True,
    )

    response = await processor.apply_transitions(transition_request)

    assert response.job_id == "job-transitions"
    assert response.transitions_applied == 1
    status = processor.get_job_status("job-transitions")
    assert status["status"] == "transitions_applied"
    assert Path(status["transitioned_audio_path"]).exists()


@pytest.mark.asyncio
async def test_export_mix_creates_copy(tmp_path, monkeypatch):
    processor = AudioProcessor()
    monkeypatch.setattr(processor, "media_root", tmp_path)

    request = AudioCombineRequest(
        job_id="job-export",
        presentation_id="presentation-2",
        segments=[AudioSegment(slide_id="slide-1", file_path=str(tmp_path / "slide.wav"), duration=1.0)],
    )
    await processor.combine_segments(request)

    export_response = await processor.export_mix(AudioExportRequest(job_id="job-export", format="wav"))

    assert export_response.job_id == "job-export"
    assert Path(export_response.export_path).exists()


@pytest.mark.asyncio
async def test_export_mix_supports_multiple_formats(tmp_path, monkeypatch):
    processor = AudioProcessor()
    monkeypatch.setattr(processor, "media_root", tmp_path)

    request = AudioCombineRequest(
        job_id="job-multi",
        presentation_id="presentation-3",
        segments=[AudioSegment(slide_id="slide-1", file_path=str(tmp_path / "slide.wav"), duration=1.0)],
    )
    await processor.combine_segments(request)

    formats = ["mp3", "mp4", "zip", "pptx"]
    for fmt in formats:
        response = await processor.export_mix(AudioExportRequest(job_id="job-multi", format=fmt))
        export_path = Path(response.export_path)
        assert export_path.exists()
        assert export_path.suffix == f".{fmt}"


@pytest.mark.asyncio
async def test_combine_segments_records_background_track(tmp_path, monkeypatch):
    processor = AudioProcessor()
    monkeypatch.setattr(processor, "media_root", tmp_path)

    request = AudioCombineRequest(
        job_id="job-bg",
        presentation_id="presentation-bg",
        segments=[
            AudioSegment(slide_id="slide-1", file_path="slide1.wav", duration=1.0),
            AudioSegment(slide_id="slide-2", file_path="slide2.wav", duration=1.0),
        ],
        background_track_path="background-track.mp3",
    )

    response = await processor.combine_segments(request)

    assert response.timeline
    assert any(entry.background_track_path == "background-track.mp3" for entry in response.timeline)


@pytest.mark.asyncio
async def test_export_mix_records_download_entry(tmp_path, monkeypatch):
    processor = AudioProcessor()
    monkeypatch.setattr(processor, "media_root", tmp_path)

    request = AudioCombineRequest(
        job_id="job-download",
        presentation_id="presentation-download",
        segments=[AudioSegment(slide_id="slide-1", file_path="slide.wav", duration=1.0)],
    )
    await processor.combine_segments(request)

    await processor.export_mix(
        AudioExportRequest(job_id="job-download", format="mp4", include_transitions=False)
    )

    status = processor.get_job_status("job-download")
    assert status is not None
    exports = status.get("exports") or []
    mp4_export = next((entry for entry in exports if entry.get("format") == "mp4"), None)
    assert mp4_export is not None
    assert mp4_export.get("download_url", "").endswith("format=mp4")



@pytest.mark.asyncio
async def test_get_job_status_unknown(tmp_path, monkeypatch):
    processor = AudioProcessor()
    monkeypatch.setattr(processor, "media_root", tmp_path)
    assert processor.get_job_status("missing") is None


def test_health_status_includes_flags(tmp_path, monkeypatch):
    processor = AudioProcessor()
    monkeypatch.setattr(processor, "media_root", tmp_path)
    health = processor.get_health_status()
    assert "ffmpeg_path" in health
    assert "supported_formats" in health
