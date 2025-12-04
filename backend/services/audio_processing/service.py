"""Audio processing service stub."""

from __future__ import annotations

import json
import shutil
import time
import zipfile
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from shared.models import (
    AudioCombineRequest,
    AudioCombineResponse,
    AudioExportRequest,
    AudioExportResponse,
    AudioSegment,
    AudioTimelineEntry,
    AudioTransition,
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

        created_at = datetime.now(UTC)
        timeline: list[AudioTimelineEntry] = []

        # Build timeline and write a silent placeholder WAV of the expected duration.
        current_position = 0.0
        for index, segment in enumerate(request.segments):
            start = current_position
            duration = float(segment.duration)
            end = start + duration
            timeline.append(
                AudioTimelineEntry(
                    slide_id=segment.slide_id,
                    start=round(start, 3),
                    end=round(end, 3),
                    duration=round(duration, 3),
                    source_path=segment.file_path,
                    volume=segment.volume,
                    background_track_path=request.background_track_path,
                )
            )
            current_position = end
            if index < len(request.segments) - 1:
                current_position -= request.crossfade_duration_ms / 1000.0
                current_position += request.padding_between_segments

        total_duration = timeline[-1].end if timeline else 0.0
        self._write_silent_wav(output_path, total_duration or 1.0)

        response = AudioCombineResponse(
            job_id=request.job_id,
            output_path=str(output_path),
            total_duration=total_duration,
            segment_count=len(request.segments),
            created_at=created_at,
            timeline=timeline,
        )

        self.job_states[request.job_id] = {
            "status": "combined",
            "timeline": timeline,
            "created_at": created_at.timestamp(),
            "combined_audio_path": str(output_path),
            "output_peak_dbfs": None,
            "output_loudness_dbfs": None,
            "transitioned_audio_path": None,
            "exports": [],
        }

        return response

    async def apply_transitions(self, request: AudioTransitionRequest) -> AudioTransitionResponse:
        job_state = self.job_states.setdefault(request.job_id, {})
        job_dir = self.media_root / request.job_id / "audio"
        ensure_directory(str(job_dir))

        combined_source = Path(
            request.combined_audio_path
            or job_state.get("transitioned_audio_path")
            or job_state.get("combined_audio_path", "")
        )
        if not combined_source.exists():
            raise FileNotFoundError(f"Combined audio not found at {combined_source}")

        output_extension = (request.output_format or combined_source.suffix.lstrip(".") or "wav").lower()
        output_path = job_dir / f"combined_with_transitions.{output_extension}"
        timeline = job_state.get("timeline", [])

        # Simplified transitions: copy combined source to target and store metadata.
        shutil.copyfile(combined_source, output_path)
        payload = {
            "job_id": request.job_id,
            "combined_audio_path": str(combined_source),
            "transitions": [transition.model_dump() for transition in request.transitions],
            "updated_at": datetime.now(UTC).isoformat(),
        }
        output_path.with_suffix(".json").write_text(json.dumps(payload, indent=2), encoding="utf-8")

        updated_at = time.time()
        job_state.update(
            {
                "status": "transitions_applied",
                "transitions": [transition.model_dump() for transition in request.transitions],
                "updated_at": updated_at,
                "combined_audio_path": job_state.get("combined_audio_path", str(combined_source)),
                "transitioned_audio_path": str(output_path),
                "download_path": str(output_path),
                "output_peak_dbfs": None,
                "output_loudness_dbfs": None,
            }
        )

        return AudioTransitionResponse(
            job_id=request.job_id,
            output_path=str(output_path),
            transitions_applied=len(request.transitions),
            created_at=datetime.now(UTC),
            updated_at=datetime.fromtimestamp(updated_at, tz=UTC),
            output_peak_dbfs=None,
            output_loudness_dbfs=None,
        )

    async def export_mix(self, request: AudioExportRequest) -> AudioExportResponse:
        job_state = self.job_states.get(request.job_id)
        if not job_state or "combined_audio_path" not in job_state:
            raise ValueError(f"No combined audio found for job {request.job_id}")

        combined_path = Path(job_state.get("transitioned_audio_path") or job_state["combined_audio_path"])
        if not combined_path.exists():
            raise FileNotFoundError(f"Combined audio not found at {combined_path}")

        job_dir = self.media_root / request.job_id / "audio"
        ensure_directory(str(job_dir))
        export_path = job_dir / f"combined.{request.format}"

        # Simplified export: copy the combined file (and build packages for zip/pptx)
        if request.format == "zip":
            self._export_zip_package(job_state, combined_path, export_path)
        elif request.format == "pptx":
            self._export_pptx_stub(job_state, combined_path, export_path)
        else:
            shutil.copyfile(combined_path, export_path)

        created_at = datetime.now(UTC)
        job_state.setdefault("exports", []).append(
            {"format": request.format, "download_url": f"/media/{request.job_id}/audio/{export_path.name}"}
        )

        return AudioExportResponse(
            job_id=request.job_id,
            export_path=str(export_path),
            format=request.format,
            file_size=export_path.stat().st_size,
            created_at=created_at,
            download_url=f"/media/{request.job_id}/audio/{export_path.name}",
        )

    def get_job_status(self, job_id: str) -> dict[str, Any] | None:
        return self.job_states.get(job_id)

    def get_health_status(self) -> dict[str, Any]:
        ffmpeg_path = None
        return {
            "ffmpeg_path": ffmpeg_path,
            "media_root": str(self.media_root),
            "supported_formats": ["wav", "mp3", "mp4", "zip", "pptx"],
        }

    def _export_zip_package(
        self,
        job_state: dict[str, Any],
        source: Path,
        target_path: Path,
    ) -> Path:
        with zipfile.ZipFile(target_path, mode="w") as archive:
            archive.write(source, arcname=source.name)
            timeline = job_state.get("timeline") or []
            archive.writestr("timeline.json", json.dumps(timeline, indent=2))
            if job_state.get("transitioned_audio_path"):
                transitioned = Path(job_state["transitioned_audio_path"])
                if transitioned.exists():
                    archive.write(transitioned, arcname=transitioned.name)
            metadata = {
                "combined_audio": job_state.get("combined_audio_path"),
                "transitioned_audio": job_state.get("transitioned_audio_path"),
                "exports": job_state.get("exports") or [],
            }
            archive.writestr("metadata.json", json.dumps(metadata, indent=2))
        return target_path

    def _export_pptx_stub(
        self,
        job_state: dict[str, Any],
        source: Path,
        target_path: Path,
    ) -> Path:
        # Create a minimal PPTX-like package containing audio and timeline metadata
        with zipfile.ZipFile(target_path, mode="w") as archive:
            archive.writestr(
                "[Content_Types].xml",
                """<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
</Types>
""".strip(),
            )
            archive.writestr(
                "ppt/presentation.xml",
                """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:notesSz cx="914400" cy="685800"/>
</p:presentation>
""".strip(),
            )
            archive.write(source, arcname=f"ppt/media/{source.name}")
            timeline = job_state.get("timeline") or []
            archive.writestr("ppt/slides/timeline.json", json.dumps(timeline, indent=2))
        return target_path

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

    def _write_silent_wav(self, path: Path, duration_seconds: float, sample_rate: int = 16000) -> None:
        duration_seconds = max(duration_seconds, 0.1)
        total_frames = int(sample_rate * duration_seconds)
        ensure_directory(str(path.parent))
        import wave

        with wave.open(str(path), "w") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)  # 16-bit
            wf.setframerate(sample_rate)
            wf.writeframes(b"\x00\x00" * total_frames)

