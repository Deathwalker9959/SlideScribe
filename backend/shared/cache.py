"""
Caching utilities for the application.
"""

from datetime import datetime, timedelta
from typing import Any


class Cache:
    """Simple in-memory cache with TTL (Time To Live) support."""

    def __init__(self) -> None:
        """Initialize empty cache."""
        self._cache: dict[str, dict[str, Any]] = {}

    def get(self, key: str) -> Any | None:
        """
        Get value from cache by key.

        Args:
            key: Cache key

        Returns:
            Cached value if exists and not expired, None otherwise
        """
        if key in self._cache:
            item = self._cache[key]
            if datetime.now() < item["expires"]:
                return item["value"]
            else:
                # Remove expired item
                del self._cache[key]
        return None

    def set(self, key: str, value: Any, ttl: int = 3600) -> None:
        """
        Set value in cache with TTL.

        Args:
            key: Cache key
            value: Value to cache
            ttl: Time to live in seconds (default: 1 hour)
        """
        self._cache[key] = {"value": value, "expires": datetime.now() + timedelta(seconds=ttl)}

    def delete(self, key: str) -> None:
        """
        Delete value from cache.

        Args:
            key: Cache key to delete
        """
        self._cache.pop(key, None)

    def clear(self) -> None:
        """Clear all cached values."""
        self._cache.clear()

    def size(self) -> int:
        """
        Get current cache size.

        Returns:
            Number of items in cache
        """
        return len(self._cache)

    def cleanup_expired(self) -> int:
        """
        Remove expired items from cache.

        Returns:
            Number of expired items removed
        """
        now = datetime.now()
        expired_keys = [key for key, item in self._cache.items() if now >= item["expires"]]

        for key in expired_keys:
            del self._cache[key]

        return len(expired_keys)
