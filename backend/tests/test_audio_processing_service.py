"""Tests for the audio processing service."""

from datetime import datetime

import pytest

from services.audio_processing.service import AudioProcessor
from shared.models import (
    AudioCombineRequest,
    AudioSegment,
    AudioTransition,
    AudioTransitionRequest,
)


@pytest.mark.asyncio
async def test_combine_segments_creates_manifest(tmp_path, monkeypatch):
    processor = AudioProcessor()
    monkeypatch.setattr(processor, "media_root", tmp_path)

    request = AudioCombineRequest(
        job_id="job-audio",
        presentation_id="presentation-1",
        segments=[
            AudioSegment(slide_id="slide-1", file_path="/tmp/audio1.wav", duration=5.0),
            AudioSegment(slide_id="slide-2", file_path="/tmp/audio2.wav", duration=7.5),
        ],
    )

    response = await processor.combine_segments(request)

    assert response.job_id == "job-audio"
    assert response.segment_count == 2
    assert abs(response.total_duration - 12.5) < 1e-6
    assert processor.get_job_status("job-audio")["status"] == "combined"


@pytest.mark.asyncio
async def test_apply_transitions_updates_state(tmp_path, monkeypatch):
    processor = AudioProcessor()
    monkeypatch.setattr(processor, "media_root", tmp_path)

    combine_request = AudioCombineRequest(
        job_id="job-transitions",
        presentation_id="presentation-1",
        segments=[AudioSegment(slide_id="slide-1", file_path="/tmp/audio.wav", duration=5.0)],
    )
    await processor.combine_segments(combine_request)

    transition_request = AudioTransitionRequest(
        job_id="job-transitions",
        combined_audio_path="/tmp/combined.wav",
        transitions=[AudioTransition(from_slide="slide-1", to_slide="slide-2", duration=1.0)],
    )

    response = await processor.apply_transitions(transition_request)

    assert response.job_id == "job-transitions"
    assert response.transitions_applied == 1
    status = processor.get_job_status("job-transitions")
    assert status["status"] == "transitions_applied"


@pytest.mark.asyncio
async def test_get_job_status_unknown(tmp_path, monkeypatch):
    processor = AudioProcessor()
    monkeypatch.setattr(processor, "media_root", tmp_path)
    assert processor.get_job_status("missing") is None
