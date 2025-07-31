"""Tests for cache utility module."""

import time
from typing import Dict, Any
from backend.shared.cache import Cache


class TestCache:
    """Test cache functionality with TTL support."""
    
    def setup_method(self) -> None:
        """Set up test cache instance."""
        self.cache = Cache()
    
    def test_cache_set_and_get(self) -> None:
        """Test basic cache set and get operations."""
        self.cache.set("key1", "value1")
        assert self.cache.get("key1") == "value1"
    
    def test_cache_get_nonexistent_key(self) -> None:
        """Test getting a key that doesn't exist."""
        assert self.cache.get("nonexistent") is None
    
    def test_cache_ttl_expiration(self) -> None:
        """Test that items expire after TTL."""
        self.cache.set("temp_key", "temp_value", ttl=1)  # 1 second TTL
        assert self.cache.get("temp_key") == "temp_value"
        
        time.sleep(1.1)  # Wait for expiration
        assert self.cache.get("temp_key") is None
    
    def test_cache_delete(self) -> None:
        """Test cache deletion."""
        self.cache.set("delete_me", "value")
        assert self.cache.get("delete_me") == "value"
        
        self.cache.delete("delete_me")
        assert self.cache.get("delete_me") is None
    
    def test_cache_clear(self) -> None:
        """Test clearing all cache entries."""
        self.cache.set("key1", "value1")
        self.cache.set("key2", "value2")
        
        self.cache.clear()
        assert self.cache.get("key1") is None
        assert self.cache.get("key2") is None
    
    def test_cache_size(self) -> None:
        """Test cache size tracking."""
        assert self.cache.size() == 0
        
        self.cache.set("key1", "value1")
        assert self.cache.size() == 1
        
        self.cache.set("key2", "value2")
        assert self.cache.size() == 2
        
        self.cache.delete("key1")
        assert self.cache.size() == 1
    
    def test_cache_cleanup_expired(self) -> None:
        """Test cleanup of expired entries."""
        self.cache.set("expired", "value", ttl=1)
        self.cache.set("persistent", "value", ttl=3600)
        
        time.sleep(1.1)  # Wait for expiration
        expired_count = self.cache.cleanup_expired()
        
        assert expired_count == 1
        assert self.cache.get("expired") is None
        assert self.cache.get("persistent") == "value"
    
    def test_cache_overwrite(self) -> None:
        """Test overwriting existing cache entries."""
        self.cache.set("key", "original")
        self.cache.set("key", "updated")
        assert self.cache.get("key") == "updated"
    
    def test_cache_with_complex_data(self) -> None:
        """Test caching complex data structures."""
        data: Dict[str, Any] = {"list": [1, 2, 3], "dict": {"nested": True}}
        self.cache.set("complex", data)
        retrieved = self.cache.get("complex")
        assert retrieved == data
