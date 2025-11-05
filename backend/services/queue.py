import os
from typing import cast

import redis

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")


class QueueManager:
    def __init__(self) -> None:
        self.redis = redis.Redis.from_url(REDIS_URL)  # type: ignore[misc]

    def enqueue(self, key: str, value: str) -> None:
        self.redis.rpush(key, value)

    def dequeue(self, key: str) -> str | None:
        result = self.redis.lpop(key)  # type: ignore[misc]
        if result is None:
            return None
        if isinstance(result, bytes):
            return result.decode("utf-8")
        return str(result)  # type: ignore[misc]

    def get_length(self, key: str) -> int:
        result = self.redis.llen(key)
        return cast(int, result)
