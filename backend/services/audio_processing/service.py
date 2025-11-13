"""Audio processing service implementation (stub)."""

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

try:  # Optional dependency for real audio work
    from pydub import AudioSegment as PydubAudioSegment

    HAS_PYDUB = True
except ImportError:  # pragma: no cover - optional dependency
    PydubAudioSegment = None
    HAS_PYDUB = False


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
        peak_dbfs: float | None = None
        loudness_dbfs: float | None = None

        if HAS_PYDUB:
            crossfade_ms = int(max(0, min(request.crossfade_duration_ms, 8000)))
            padding_ms = int(max(0.0, min(request.padding_between_segments, 5.0)) * 1000)
            combined_audio: PydubAudioSegment | None = None
            current_position = 0.0

            for index, segment in enumerate(request.segments):
                audio_chunk = self._load_audio_segment(segment)
                if segment.volume is not None:
                    audio_chunk += segment.volume

                # Trim to requested duration if provided
                if segment.duration and len(audio_chunk) > int(segment.duration * 1000):
                    audio_chunk = audio_chunk[: int(segment.duration * 1000)]

                chunk_duration = len(audio_chunk) / 1000.0
                entry = self._build_timeline_entry(
                    segment=segment,
                    start=current_position,
                    duration=chunk_duration,
                    request=request,
                )
                timeline.append(entry)

                if combined_audio is None:
                    combined_audio = audio_chunk
                else:
                    combined_audio = combined_audio.append(audio_chunk, crossfade=crossfade_ms)

                current_position = entry.end
                if crossfade_ms > 0 and index < len(request.segments) - 1:
                    current_position -= crossfade_ms / 1000.0
                if padding_ms > 0 and index < len(request.segments) - 1:
                    combined_audio += PydubAudioSegment.silent(duration=padding_ms)
                    current_position += padding_ms / 1000.0

            if combined_audio is None:
                combined_audio = PydubAudioSegment.silent(duration=1000)
                timeline.append(
                    AudioTimelineEntry(
                        slide_id="generated",
                        start=0.0,
                        end=1.0,
                        duration=1.0,
                        source_path="generated",
                        volume=0.0,
                        background_track_path=request.background_track_path,
                    )
                )

            if request.background_track_path:
                combined_audio = self._apply_background_track(combined_audio, request)

            if request.normalize:
                combined_audio = self._apply_normalization(combined_audio, request.target_loudness)

            peak_dbfs = combined_audio.max_dBFS
            loudness_dbfs = combined_audio.dBFS
            combined_audio.export(str(output_path), format=request.output_format)
            total_duration = timeline[-1].end if timeline else len(combined_audio) / 1000.0
        else:
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
            payload = {
                "presentation_id": request.presentation_id,
                "job_id": request.job_id,
                "segments": [segment.model_dump() for segment in request.segments],
                "output_format": request.output_format,
                "total_duration": total_duration,
                "timeline": [entry.model_dump() for entry in timeline],
                "created_at": created_at.isoformat(),
            }
            output_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

        response = AudioCombineResponse(
            job_id=request.job_id,
            output_path=str(output_path),
            total_duration=total_duration,
            segment_count=len(request.segments),
            created_at=created_at,
            timeline=timeline,
            peak_dbfs=peak_dbfs,
            loudness_dbfs=loudness_dbfs,
            background_track_path=request.background_track_path,
        )

        self.job_states[request.job_id] = {
            "status": "combined",
            "combined_audio_path": str(output_path),
            "total_duration": total_duration,
            "segment_count": len(request.segments),
            "created_at": created_at.timestamp(),
            "download_path": str(output_path),
            "timeline": [entry.model_dump() for entry in timeline],
            "peak_dbfs": peak_dbfs,
            "loudness_dbfs": loudness_dbfs,
            "background_track_path": request.background_track_path,
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
        peak_dbfs: float | None = None
        loudness_dbfs: float | None = None

        if HAS_PYDUB:
            audio = PydubAudioSegment.from_file(str(combined_source))
            for transition in request.transitions:
                start_ms = self._find_transition_start_ms(timeline, transition)
                fade_ms = max(100, int(max(transition.duration, 0.1) * 1000))
                audio = self._apply_transition_window(audio, start_ms, fade_ms)

            if request.normalize:
                audio = self._apply_normalization(audio, request.target_loudness)

            peak_dbfs = audio.max_dBFS
            loudness_dbfs = audio.dBFS
            audio.export(str(output_path), format=output_extension)
        else:
            payload = {
                "job_id": request.job_id,
                "combined_audio_path": str(combined_source),
                "transitions": [transition.model_dump() for transition in request.transitions],
                "updated_at": datetime.now(UTC).isoformat(),
            }
            output_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

        updated_at = time.time()
        job_state.update(
            {
                "status": "transitions_applied",
                "transitions": [transition.model_dump() for transition in request.transitions],
                "updated_at": updated_at,
                "combined_audio_path": job_state.get("combined_audio_path", str(combined_source)),
                "transitioned_audio_path": str(output_path),
                "download_path": str(output_path),
                "output_peak_dbfs": peak_dbfs,
                "output_loudness_dbfs": loudness_dbfs,
            }
        )

        return AudioTransitionResponse(
            job_id=request.job_id,
            output_path=str(output_path),
            transitions_applied=len(request.transitions),
            created_at=datetime.now(UTC),
            updated_at=datetime.fromtimestamp(updated_at, tz=UTC),
            output_peak_dbfs=peak_dbfs,
            output_loudness_dbfs=loudness_dbfs,
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

    async def export_mix(self, request: AudioExportRequest) -> AudioExportResponse:
        job_state = self.job_states.get(request.job_id)
        if not job_state:
            raise FileNotFoundError(f"No audio job found for {request.job_id}")

        source_key = "transitioned_audio_path" if request.include_transitions else "combined_audio_path"
        source_path = job_state.get(source_key) or job_state.get("combined_audio_path")
        if not source_path:
            raise FileNotFoundError("No audio mix available to export")

        source = Path(source_path)
        if not source.exists():
            raise FileNotFoundError(f"Audio source does not exist at {source}")

        job_dir = self.media_root / request.job_id / "audio"
        ensure_directory(str(job_dir))
        target_path = job_dir / f"export.{request.format}"
        export_format = request.format.lower()

        if export_format in {"wav", "mp3", "mp4"}:
            target_path = await self._export_audio_file(source, target_path, export_format)
        elif export_format == "zip":
            target_path = self._export_zip_package(job_state, source, target_path)
        elif export_format == "pptx":
            target_path = self._export_pptx_stub(job_state, source, target_path)
        else:  # pragma: no cover - guarded by validator
            raise ValueError(f"Unsupported export format '{request.format}'")

        file_size = target_path.stat().st_size
        timestamp = time.time()
        job_state["last_export_path"] = str(target_path)
        job_state["download_path"] = str(target_path)
        job_state["last_export_at"] = timestamp
        exports = job_state.setdefault("exports", [])
        export_record = {
            "format": export_format,
            "path": str(target_path),
            "created_at": datetime.fromtimestamp(timestamp, tz=UTC).isoformat(),
            "file_size": file_size,
            "download_url": f"/api/v1/audio/download/{request.job_id}?format={export_format}",
        }
        exports.append(export_record)

        return AudioExportResponse(
            job_id=request.job_id,
            export_path=str(target_path),
            format=request.format,
            file_size=file_size,
            created_at=datetime.now(UTC),
            download_url=export_record["download_url"],
        )

    def get_health_status(self) -> dict[str, Any]:
        ffmpeg_path = None
        if HAS_PYDUB and hasattr(PydubAudioSegment, "converter"):
            ffmpeg_path = getattr(PydubAudioSegment, "converter")
        return {
            "pydub_available": HAS_PYDUB,
            "ffmpeg_path": ffmpeg_path,
            "media_root": str(self.media_root),
            "supported_formats": ["wav", "mp3", "mp4", "zip", "pptx"],
        }

    def get_export(self, job_id: str, format_name: str) -> dict[str, Any] | None:
        state = self.job_states.get(job_id)
        if not state:
            return None
        exports = state.get("exports") or []
        target = format_name.lower()
        for export in exports:
            if isinstance(export, dict) and str(export.get("format", "")).lower() == target:
                return export
        return None

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

    def _build_timeline_entry(
        self,
        segment: AudioSegment,
        *,
        start: float,
        duration: float,
        request: AudioCombineRequest,
    ) -> AudioTimelineEntry:
        end = start + duration
        return AudioTimelineEntry(
            slide_id=segment.slide_id,
            start=round(start, 3),
            end=round(end, 3),
            duration=round(duration, 3),
            source_path=segment.file_path,
            volume=segment.volume,
            background_track_path=request.background_track_path,
        )

    def _apply_background_track(
        self,
        audio: "PydubAudioSegment",
        request: AudioCombineRequest,
    ) -> "PydubAudioSegment":
        if not HAS_PYDUB or not request.background_track_path:
            return audio

        background_file = Path(request.background_track_path)
        if not background_file.exists():
            self.logger.warning("Background track not found at %s", background_file)
            return audio

        try:
            if background_file.suffix.lower() == ".wav":
                background = PydubAudioSegment.from_wav(str(background_file))
            else:
                background = PydubAudioSegment.from_file(str(background_file))
        except Exception as exc:  # pragma: no cover - defensive
            self.logger.warning("Unable to load background track %s: %s", background_file, exc)
            return audio

        if len(background) == 0:
            return audio

        loops = int(len(audio) / len(background)) + 1
        layered = (background * max(1, loops))[: len(audio)]
        adjustment = request.background_volume + request.ducking_db
        layered = layered + adjustment
        return audio.overlay(layered)

    def _apply_normalization(
        self,
        audio: "PydubAudioSegment",
        target_loudness: float,
    ) -> "PydubAudioSegment":
        if not HAS_PYDUB:
            return audio
        current_loudness = audio.dBFS
        if current_loudness == float("-inf"):
            return audio
        gain_change = target_loudness - current_loudness
        return audio.apply_gain(gain_change)

    def _apply_transition_window(
        self,
        audio: "PydubAudioSegment",
        start_ms: int,
        duration_ms: int,
    ) -> "PydubAudioSegment":
        if not HAS_PYDUB or duration_ms <= 0:
            return audio
        fade_start = max(0, start_ms - duration_ms // 2)
        fade_end = min(len(audio), start_ms + duration_ms // 2)
        if fade_end <= fade_start:
            return audio
        pre = audio[:fade_start]
        window = audio[fade_start:fade_end]
        post = audio[fade_end:]
        half = max(10, duration_ms // 2)
        window = window.fade_in(half).fade_out(half)
        return pre + window + post

    def _find_transition_start_ms(self, timeline: list[Any], transition: AudioTransition) -> int:
        def _extract(entry: Any) -> tuple[str | None, float | None, float | None]:
            if isinstance(entry, AudioTimelineEntry):
                return entry.slide_id, entry.start, entry.end
            if isinstance(entry, dict):
                return (
                    entry.get("slide_id"),
                    float(entry.get("start", 0.0)),
                    float(entry.get("end", 0.0)),
                )
            return None, None, None

        target_start = None
        for entry in timeline:
            slide_id, start, _ = _extract(entry)
            if slide_id == transition.to_slide and start is not None:
                target_start = start
                break

        if target_start is None:
            for entry in timeline:
                slide_id, _, end = _extract(entry)
                if slide_id == transition.from_slide and end is not None:
                    target_start = end
                    break

        if target_start is None:
            return 0
        return int(max(0.0, target_start) * 1000)

    async def _export_audio_file(
        self,
        source: Path,
        target_path: Path,
        export_format: str,
    ) -> Path:
        if HAS_PYDUB:
            audio = PydubAudioSegment.from_file(str(source))
            if export_format != source.suffix.lstrip(".").lower():
                audio.export(str(target_path), format=export_format)
                return target_path
        shutil.copyfile(source, target_path)
        return target_path

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

    def _load_audio_segment(self, segment: AudioSegment) -> "PydubAudioSegment":
        if not HAS_PYDUB:
            raise RuntimeError("pydub is required for audio operations")

        path = Path(segment.file_path)
        if path.exists():
            try:
                if path.suffix.lower() == ".wav":
                    audio_chunk = PydubAudioSegment.from_wav(str(path))
                else:
                    audio_chunk = PydubAudioSegment.from_file(str(path))
                if segment.start_offset:
                    offset_ms = max(0, int(segment.start_offset * 1000))
                    audio_chunk = audio_chunk[offset_ms:]
                if segment.duration and segment.duration > 0:
                    target_ms = int(segment.duration * 1000)
                    if len(audio_chunk) > target_ms:
                        audio_chunk = audio_chunk[:target_ms]
                return audio_chunk
            except Exception as exc:  # pragma: no cover - fallback to silent
                self.logger.warning("Failed to load audio segment %s: %s", segment.file_path, exc)

        duration_ms = max(500, int(segment.duration * 1000))
        return PydubAudioSegment.silent(duration=duration_ms)
