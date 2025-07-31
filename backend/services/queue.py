import os
import redis
from typing import Optional, cast

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

class QueueManager:
    def __init__(self) -> None:
        self.redis = redis.Redis.from_url(REDIS_URL)  # type: ignore[misc]

    def enqueue(self, key: str, value: str) -> None:
        self.redis.rpush(key, value)

    def dequeue(self, key: str) -> Optional[str]:
        result = self.redis.lpop(key)  # type: ignore[misc]
        # Handle Redis return types - can be bytes, str, or None
        if result is None:
            return None
        # If result is bytes, decode it; if it's already a string, return as-is
        if isinstance(result, bytes):
            return result.decode('utf-8')
        return str(result)  # type: ignore[misc]

    def get_length(self, key: str) -> int:
        result = self.redis.llen(key)
        return cast(int, result)
