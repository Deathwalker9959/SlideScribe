"""Custom voice management for user-uploaded voice samples."""

import base64
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

from shared.models import (
    VoiceProfile,
    VoiceSampleUploadRequest,
    VoiceType,
)
from shared.utils import setup_logging

logger = setup_logging("custom-voices")


class CustomVoiceManager:
    """Manage user-uploaded voice samples for voice cloning."""

    def __init__(self, base_path: str | None = None):
        """Initialize custom voice manager.

        Args:
            base_path: Base directory for storing voice samples.
                      Defaults to ./voice_profiles/samples
        """
        self.base_path = Path(base_path or "./voice_profiles/samples")
        self.base_path.mkdir(parents=True, exist_ok=True)

    async def upload_voice_sample(
        self,
        user_id: str,
        request: VoiceSampleUploadRequest
    ) -> VoiceProfile:
        """Upload and validate voice sample, create voice profile.

        Args:
            user_id: User identifier for per-user isolation
            request: Voice sample upload request

        Returns:
            Created VoiceProfile

        Raises:
            ValueError: If validation fails
        """
        # 1. Decode base64 audio
        try:
            audio_bytes = base64.b64decode(request.audio_data_base64)
        except Exception as exc:
            raise ValueError(f"Invalid base64 audio data: {exc}") from exc

        # 2. Validate audio
        validation = await self._validate_audio(audio_bytes, request.audio_format)
        if not validation["valid"]:
            raise ValueError(validation["error"])

        # 3. Store in per-user directory
        user_dir = self.base_path / user_id
        user_dir.mkdir(parents=True, exist_ok=True)

        profile_id = str(uuid.uuid4())

        # Convert to WAV if needed (Chatterbox requires WAV format)
        audio_format = request.audio_format.lower()
        if audio_format != "wav":
            logger.info(f"Converting {audio_format} to WAV for Chatterbox compatibility")
            audio_bytes = await self._convert_to_wav(audio_bytes, audio_format)
            audio_format = "wav"

        filename = f"{profile_id}.{audio_format}"
        file_path = user_dir / filename

        with open(file_path, "wb") as f:
            f.write(audio_bytes)

        logger.info(
            f"Uploaded voice sample for user {user_id}: {file_path} "
            f"({len(audio_bytes)} bytes, {validation['duration']:.2f}s)"
        )

        # 4. Create voice profile
        profile = VoiceProfile(
            id=profile_id,
            name=request.name,
            description=request.description,
            voice=profile_id,  # Use profile_id as voice identifier
            language=request.language,
            voice_type=VoiceType.CUSTOM_CLONED,
            audio_sample_path=str(file_path),
            cloning_provider="chatterbox",
            owner_id=user_id,
            sample_metadata={
                "duration": validation["duration"],
                "format": request.audio_format,
                "size_bytes": len(audio_bytes)
            },
            tags=request.tags,
            style=None,
            speed=1.0,
            pitch=0.0,
            volume=1.0,
            created_at=datetime.now(),
        )

        return profile

    async def _validate_audio(
        self,
        audio_bytes: bytes,
        audio_format: str
    ) -> dict[str, Any]:
        """Validate audio duration, format, and quality.

        Args:
            audio_bytes: Raw audio file bytes
            audio_format: Expected audio format (wav or mp3)

        Returns:
            Dictionary with validation results:
                - valid: bool indicating if validation passed
                - error: str error message if validation failed
                - duration: float audio duration in seconds
        """
        import io

        allowed_formats = {"wav", "mp3"}
        if audio_format.lower() not in allowed_formats:
            return {
                "valid": False,
                "error": f"Unsupported audio format: {audio_format}. Allowed formats: {', '.join(sorted(allowed_formats))}",
                "duration": 0.0,
            }

        try:
            import subprocess
            import tempfile

            fmt = audio_format.lower()
            if fmt not in {"wav", "mp3"}:
                return {
                    "valid": False,
                    "error": f"Unsupported audio format: {audio_format}",
                    "duration": 0.0,
                }

            with tempfile.NamedTemporaryFile(suffix=f".{fmt}", delete=False) as tmp_file:
                tmp_file.write(audio_bytes)
                tmp_path = tmp_file.name

            try:
                probe = subprocess.run(
                    [
                        "ffprobe",
                        "-v",
                        "error",
                        "-show_entries",
                        "format=duration",
                        "-of",
                        "default=noprint_wrappers=1:nokey=1",
                        tmp_path,
                    ],
                    capture_output=True,
                    text=True,
                    check=True,
                )
                duration = float(probe.stdout.strip())
            finally:
                Path(tmp_path).unlink(missing_ok=True)

            if duration < 5.0:
                return {
                    "valid": False,
                    "error": "Audio too short (minimum 5 seconds required)",
                    "duration": duration,
                }
            if duration > 600.0:
                return {
                    "valid": False,
                    "error": "Audio too long (maximum 10 minutes allowed)",
                    "duration": duration,
                }

            return {"valid": True, "duration": duration}

        except Exception as exc:
            logger.error(f"Audio validation failed: {exc}")
            return {
                "valid": False,
                "error": f"Failed to validate audio file: {exc}",
                "duration": 0.0,
            }

    async def delete_custom_voice(self, user_id: str, profile_id: str) -> bool:
        """Delete voice sample file and profile.

        Args:
            user_id: User identifier
            profile_id: Voice profile identifier

        Returns:
            True if deletion successful, False if file not found
        """
        # Try common formats we allow for uploads
        for ext in ["wav", "mp3"]:
            file_path = self.base_path / user_id / f"{profile_id}.{ext}"
            if file_path.exists():
                file_path.unlink()
                logger.info(f"Deleted voice sample: {file_path}")
                return True

        logger.warning(f"Voice sample not found for deletion: user={user_id}, profile={profile_id}")
        return False

    @staticmethod
    async def _convert_to_wav(audio_bytes: bytes, audio_format: str) -> bytes:
        """Convert audio bytes to WAV format using ffmpeg."""
        import tempfile
        import subprocess

        fmt = audio_format.lower()
        if fmt not in {"mp3", "wav"}:
            raise ValueError(f"Unsupported format for conversion: {audio_format}")

        if fmt == "wav":
            return audio_bytes

        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp_in:
            tmp_in.write(audio_bytes)
            tmp_in_path = tmp_in.name

        tmp_out_path = f"{tmp_in_path}.wav"
        try:
            subprocess.run(
                ["ffmpeg", "-y", "-i", tmp_in_path, "-ar", "24000", "-ac", "1", tmp_out_path],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            return Path(tmp_out_path).read_bytes()
        except Exception as exc:
            raise ValueError(f"Failed to convert {audio_format} to WAV: {exc}") from exc
        finally:
            Path(tmp_in_path).unlink(missing_ok=True)
            Path(tmp_out_path).unlink(missing_ok=True)

    async def get_user_voices(self, user_id: str) -> list[Path]:
        """Get all voice sample files for a user.

        Args:
            user_id: User identifier

        Returns:
            List of Path objects for user's voice samples
        """
        user_dir = self.base_path / user_id
        if not user_dir.exists():
            return []

        voice_files = []
        for ext in ["wav", "mp3"]:
            voice_files.extend(user_dir.glob(f"*.{ext}"))

        return voice_files
