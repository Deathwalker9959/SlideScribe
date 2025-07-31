"""
Configuration management for services.
"""
import os
import json
from typing import Dict, Any
from dotenv import load_dotenv


class ServiceConfig:
    """Configuration management for services using environment variables."""
    
    def __init__(self) -> None:
        """Initialize configuration by loading environment variables."""
        # Always load .env from project root
        env_path = os.path.join(os.path.dirname(__file__), '../../.env')
        load_dotenv(dotenv_path=env_path, override=True)
        self.config: Dict[str, Any] = {}
        self.load_from_env()
    
    def load_from_env(self) -> None:
        """Load configuration from environment variables."""
        self.config = {
            'openai_api_key': os.getenv('OPENAI_API_KEY'),
            'azure_speech_key': os.getenv('AZURE_SPEECH_KEY'),
            'azure_speech_region': os.getenv('AZURE_SPEECH_REGION'),
            'database_url': os.getenv('DATABASE_URL'),
            'redis_url': os.getenv('REDIS_URL'),
            'media_root': os.getenv('MEDIA_ROOT', '/app/media'),
            'debug': os.getenv('DEBUG', 'false').lower() == 'true',
            'allowed_origins': json.loads(os.getenv('ALLOWED_ORIGINS', '["*"]')),
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


# Global configuration instance
config = ServiceConfig()
