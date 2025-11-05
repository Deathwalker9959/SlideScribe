"""Audio processing service implementation (stub)."""

from __future__ import annotations

import json
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from shared.models import (
    AudioCombineRequest,
    AudioCombineResponse,
    AudioSegment,
    AudioTransitionRequest,
    AudioTransitionResponse,
)
from shared.utils import Cache, ensure_directory, setup_logging, config as service_config


class AudioProcessor:
    """Stubbed audio processor that records metadata and manages job state."""

    def __init__(self) -> None:
        self.logger = setup_logging("audio-processor")
        configured_root = Path(service_config.get("media_root", "./media"))
        self.media_root = self._initialize_media_root(configured_root)
        self.cache = Cache()
        self.job_states: dict[str, dict[str, Any]] = {}

    async def combine_segments(self, request: AudioCombineRequest) -> AudioCombineResponse:
        if not request.segments:
            raise ValueError("At least one audio segment is required")

        job_dir = self.media_root / request.job_id / "audio"
        ensure_directory(str(job_dir))
        output_path = job_dir / f"combined.{request.output_format}"

        total_duration = sum(segment.duration for segment in request.segments)

        payload = {
            "presentation_id": request.presentation_id,
            "job_id": request.job_id,
            "segments": [segment.model_dump() for segment in request.segments],
            "output_format": request.output_format,
            "total_duration": total_duration,
            "created_at": datetime.now(UTC).isoformat(),
        }
        output_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

        created_at = datetime.now(UTC)
        response = AudioCombineResponse(
            job_id=request.job_id,
            output_path=str(output_path),
            total_duration=total_duration,
            segment_count=len(request.segments),
            created_at=created_at,
        )

        self.job_states[request.job_id] = {
            "status": "combined",
            "combined_audio_path": str(output_path),
            "total_duration": total_duration,
            "segment_count": len(request.segments),
            "created_at": created_at.timestamp(),
        }

        return response

    async def apply_transitions(self, request: AudioTransitionRequest) -> AudioTransitionResponse:
        job_state = self.job_states.setdefault(request.job_id, {})
        job_dir = self.media_root / request.job_id / "audio"
        ensure_directory(str(job_dir))
        output_path = job_dir / "combined_with_transitions.json"

        payload = {
            "job_id": request.job_id,
            "combined_audio_path": request.combined_audio_path,
            "transitions": [transition.model_dump() for transition in request.transitions],
            "updated_at": datetime.now(UTC).isoformat(),
        }
        output_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

        job_state.update(
            {
                "status": "transitions_applied",
                "transitions": payload["transitions"],
                "updated_at": time.time(),
                "combined_audio_path": request.combined_audio_path,
            }
        )

        return AudioTransitionResponse(
            job_id=request.job_id,
            output_path=str(output_path),
            transitions_applied=len(request.transitions),
            created_at=datetime.now(UTC),
        )

    def get_job_status(self, job_id: str) -> dict[str, Any] | None:
        state = self.job_states.get(job_id)
        if not state:
            return None
        normalized = dict(state)
        for key in ("created_at", "updated_at"):
            if key in normalized and normalized[key]:
                normalized[key] = datetime.fromtimestamp(normalized[key], tz=UTC).isoformat()
        return normalized

    def reset(self) -> None:
        self.job_states.clear()
        audio_dir = self.media_root / "audio"
        if audio_dir.exists():
            for child in audio_dir.glob("**/*"):
                try:
                    if child.is_file():
                        child.unlink()
                except OSError:
                    continue

    def _initialize_media_root(self, target: Path) -> Path:
        try:
            ensure_directory(str(target))
            return target
        except PermissionError:
            fallback = Path("./media")
            ensure_directory(str(fallback))
            self.logger.warning(
                "Unable to create audio media directory at %s; falling back to %s",
                target,
                fallback,
            )
            return fallback
