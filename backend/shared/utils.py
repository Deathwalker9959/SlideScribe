import hashlib
import json
import logging
import os
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import aiohttp


def setup_logging(service_name: str, log_level: str = "INFO") -> logging.Logger:
    """Setup logging configuration for a service"""
    logger = logging.getLogger(service_name)
    logger.setLevel(getattr(logging, log_level.upper()))

    if not logger.handlers:
        handler = logging.StreamHandler()
        formatter = logging.Formatter(f"%(asctime)s - {service_name} - %(levelname)s - %(message)s")
        handler.setFormatter(formatter)
        logger.addHandler(handler)

    return logger


def generate_hash(text: str) -> str:
    """Generate a hash for caching purposes"""
    return hashlib.md5(text.encode()).hexdigest()


def sanitize_filename(filename: str) -> str:
    """Sanitize filename for safe storage"""
    invalid_chars = '<>:"/\\|?*'
    for char in invalid_chars:
        filename = filename.replace(char, "_")
    return filename


def ensure_directory(path: str) -> None:
    """Ensure directory exists, create if not"""
    Path(path).mkdir(parents=True, exist_ok=True)


class AsyncHTTPClient:
    """Async HTTP client for inter-service communication"""

    def __init__(self, timeout: int = 30):
        self.timeout = aiohttp.ClientTimeout(total=timeout)
        self.session: aiohttp.ClientSession | None = None

    async def __aenter__(self):
        self.session = aiohttp.ClientSession(timeout=self.timeout)
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()

    async def get(self, url: str, headers: dict | None = None) -> dict[str, Any]:
        async with self.session.get(url, headers=headers) as response:
            return await response.json()

    async def post(
        self, url: str, data: dict | None = None, headers: dict | None = None
    ) -> dict[str, Any]:
        async with self.session.post(url, json=data, headers=headers) as response:
            return await response.json()


class Cache:
    """Simple in-memory cache with TTL"""

    def __init__(self):
        self._cache: dict[str, dict[str, Any]] = {}

    def get(self, key: str) -> Any | None:
        if key in self._cache:
            item = self._cache[key]
            if datetime.now() < item["expires"]:
                return item["value"]
            else:
                del self._cache[key]
        return None

    def set(
        self,
        key: str,
        value: Any,
        ttl: int = 3600,
        ttl_seconds: int | None = None,
    ) -> None:
        effective_ttl = ttl_seconds if ttl_seconds is not None else ttl
        self._cache[key] = {
            "value": value,
            "expires": datetime.now() + timedelta(seconds=effective_ttl),
        }

    def delete(self, key: str) -> None:
        self._cache.pop(key, None)

    def clear(self) -> None:
        self._cache.clear()


def validate_text_length(text: str, max_length: int = 10000) -> str:
    """Validate and truncate text if necessary"""
    if len(text) > max_length:
        return text[:max_length]
    return text


def extract_text_from_slide(slide_data: dict[str, Any]) -> str:
    """Extract text content from slide data"""
    text_parts = []

    if slide_data.get("title"):
        text_parts.append(slide_data["title"])

    if slide_data.get("content"):
        text_parts.append(slide_data["content"])

    if slide_data.get("notes"):
        text_parts.append(slide_data["notes"])

    return " ".join(text_parts)


def format_time_for_subtitle(seconds: float) -> str:
    """Format time in seconds to SRT time format (HH:MM:SS,mmm)"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    milliseconds = int((seconds % 1) * 1000)

    return f"{hours:02d}:{minutes:02d}:{secs:02d},{milliseconds:03d}"


def generate_srt_content(subtitles: list[dict[str, Any]]) -> str:
    """Generate SRT subtitle content"""
    srt_content = []

    for i, subtitle in enumerate(subtitles, 1):
        start_time = format_time_for_subtitle(subtitle["start_time"])
        end_time = format_time_for_subtitle(subtitle["end_time"])
        text = subtitle["text"]

        srt_content.append(f"{i}")
        srt_content.append(f"{start_time} --> {end_time}")
        srt_content.append(text)
        srt_content.append("")  # Empty line between subtitles

    return "\n".join(srt_content)


def chunk_text(text: str, max_length: int = 500) -> list[str]:
    """Split text into chunks for processing, preserving all characters."""
    if len(text) <= max_length:
        return [text]
    chunks = []
    start = 0
    while start < len(text):
        end = min(start + max_length, len(text))
        chunks.append(text[start:end])
        start = end
    return chunks


class ServiceConfig:
    """Configuration management for services"""

    def __init__(self):
        self.config = {}
        self.load_from_env()

    def load_from_env(self):
        """Load configuration from environment variables"""
        self.config = {
            "openai_api_key": os.getenv("OPENAI_API_KEY"),
            "azure_speech_key": os.getenv("AZURE_SPEECH_KEY"),
            "azure_speech_region": os.getenv("AZURE_SPEECH_REGION"),
            "azure_vision_endpoint": os.getenv("AZURE_VISION_ENDPOINT"),
            "azure_vision_key": os.getenv("AZURE_VISION_KEY"),
            "database_url": os.getenv("DATABASE_URL"),
            "redis_url": os.getenv("REDIS_URL"),
            "media_root": os.getenv("MEDIA_ROOT", "/app/media"),
            "debug": os.getenv("DEBUG", "false").lower() == "true",
            "allowed_origins": json.loads(os.getenv("ALLOWED_ORIGINS", '["*"]')),
            "image_analysis_provider": os.getenv("IMAGE_ANALYSIS_PROVIDER", "stub"),
            "image_analysis_cache_ttl": int(os.getenv("IMAGE_ANALYSIS_CACHE_TTL", "3600")),
            "image_analysis_openai_model": os.getenv("IMAGE_ANALYSIS_OPENAI_MODEL", "gpt-4o-mini"),
        }

    def get(self, key: str, default: Any = None) -> Any:
        return self.config.get(key, default)

    def set(self, key: str, value: Any) -> None:
        self.config[key] = value


# Global configuration instance
config = ServiceConfig()
