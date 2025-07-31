"""
Consolidated utilities module.
This module re-exports commonly used utilities from specialized modules.
"""

# Logging utilities
from .logging_utils import setup_logging, get_logger

# Configuration management
from .config import config, ServiceConfig

# Caching utilities  
from .cache import Cache

# HTTP client utilities
from .http_client import AsyncHTTPClient

# File and text processing utilities
from .file_utils import (
    generate_hash,
    sanitize_filename,
    ensure_directory,
    validate_text_length,
    extract_text_from_slide,
    chunk_text
)

# Media and subtitle utilities
from .media_utils import (
    format_time_for_subtitle,
    generate_srt_content,
    validate_subtitle_timing
)

# Re-export for backward compatibility
__all__ = [
    # Logging
    'setup_logging',
    'get_logger',
    # Config
    'config',
    'ServiceConfig',
    # Cache
    'Cache',
    # HTTP
    'AsyncHTTPClient',
    # File utilities
    'generate_hash',
    'sanitize_filename',
    'ensure_directory',
    'validate_text_length',
    'extract_text_from_slide',
    'chunk_text',
    # Media utilities
    'format_time_for_subtitle',
    'generate_srt_content',
    'validate_subtitle_timing',
]
