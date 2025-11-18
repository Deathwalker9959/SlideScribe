"""
Configuration management for services.
"""

import json
import os
from typing import Any

import yaml

from dotenv import load_dotenv


class ServiceConfig:
    """Configuration management for services using environment variables."""

    def __init__(self) -> None:
        """Initialize configuration by loading environment variables."""
        # Always load .env from backend directory (where app.py is located)
        env_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.env"))
        load_dotenv(dotenv_path=env_path, override=True)
        self.config: dict[str, Any] = {}
        self.pipeline_config: dict[str, Any] = {}
        self.pipeline_config_path = os.getenv(
            "PIPELINE_CONFIG_PATH",
            os.path.join(os.path.dirname(__file__), "../../config/pipeline.yaml"),
        )
        self.load_from_env()
        self.load_pipeline_config()

    def load_from_env(self) -> None:
        """Load configuration from environment variables."""
        self.config = {
            "openai_api_key": os.getenv("OPENAI_API_KEY"),
            "azure_openai_key": os.getenv("AZURE_OPENAI_KEY"),
            "azure_openai_endpoint": os.getenv("AZURE_OPENAI_ENDPOINT"),
            "azure_openai_deployment": os.getenv("AZURE_OPENAI_DEPLOYMENT"),
            "azure_openai_api_version": os.getenv("AZURE_OPENAI_API_VERSION"),
            "use_azure_openai": os.getenv("USE_AZURE_OPENAI", "false").lower() == "true",
            "use_azure_openai_vision": os.getenv("USE_AZURE_OPENAI_VISION", "false").lower() == "true",
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
            "auth_driver": os.getenv("AUTH_DRIVER", "database"),
            "auth_session_expire_minutes": int(os.getenv("AUTH_SESSION_EXPIRE_MINUTES", "1440")),
            "auth_anonymous_session_expire_minutes": int(os.getenv("AUTH_ANONYMOUS_SESSION_EXPIRE_MINUTES", "480")),
        }

    def get(self, key: str, default: Any = None) -> Any:
        """
        Get configuration value by key.

        Args:
            key: Configuration key
            default: Default value if key not found

        Returns:
            Configuration value
        """
        return self.config.get(key, default)

    def set(self, key: str, value: Any) -> None:
        """
        Set configuration value.

        Args:
            key: Configuration key
            value: Configuration value
        """
        self.config[key] = value

    def reload(self) -> None:
        """Reload configuration from environment variables."""
        self.load_from_env()
        self.load_pipeline_config()

    def load_pipeline_config(self) -> None:
        """Load pipeline configuration from YAML file."""
        path = os.path.abspath(self.pipeline_config_path)
        try:
            with open(path, "r", encoding="utf-8") as stream:
                data = yaml.safe_load(stream) or {}
        except FileNotFoundError:
            data = {}
        self.pipeline_config = data

    def get_pipeline_value(self, path: str, default: Any = None) -> Any:
        """Retrieve a pipeline configuration value via dotted path."""
        env_override_key = f"PIPELINE_FLAG_{path.replace('.', '_').upper()}"
        env_value = os.getenv(env_override_key)
        if env_value is not None:
            return self._coerce_env_value(env_value, default)

        node: Any = self.pipeline_config
        for part in path.split("."):
            if isinstance(node, dict) and part in node:
                node = node[part]
            else:
                return default
        return node if node is not None else default

    def set_pipeline_config(self, pipeline_config: dict[str, Any]) -> None:
        """Override pipeline configuration (useful for tests)."""
        self.pipeline_config = pipeline_config

    @staticmethod
    def _coerce_env_value(raw: str, default: Any) -> Any:
        lowered = raw.lower()
        if lowered in {"true", "false"}:
            return lowered == "true"
        if lowered.replace(".", "", 1).isdigit():
            try:
                return float(lowered) if "." in lowered else int(lowered)
            except ValueError:
                return raw
        return raw or default


# Global configuration instance
config = ServiceConfig()
