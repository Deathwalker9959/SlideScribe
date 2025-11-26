import logging
import os
import time
from typing import cast

import redis

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
logger = logging.getLogger(__name__)


class QueueManager:
    def __init__(self) -> None:
        logger.info(f"QueueManager.__init__() - REDIS_URL from env: {REDIS_URL}")
        self.redis = redis.Redis.from_url(REDIS_URL, decode_responses=True)  # type: ignore[misc]
        self._connection_checked = False
        logger.info(f"QueueManager initialized with Redis URL: {REDIS_URL}")

    def _ensure_connection(self) -> None:
        """Lazy connection check with retry logic."""
        if self._connection_checked:
            return

        max_retries = 3
        retry_delay = 1.0

        for attempt in range(max_retries):
            try:
                self.redis.ping()
                self._connection_checked = True
                logger.info(f"Successfully connected to Redis at {REDIS_URL}")
                return
            except Exception as e:
                if attempt == max_retries - 1:
                    logger.error(f"Failed to connect to Redis at {REDIS_URL} after {max_retries} attempts: {e}")
                    raise ConnectionError(f"Redis connection failed: {e}") from e
                else:
                    logger.warning(f"Redis connection attempt {attempt + 1} failed, retrying in {retry_delay}s: {e}")
                    time.sleep(retry_delay)
                    retry_delay *= 2

    def enqueue(self, key: str, value: str) -> None:
        try:
            self._ensure_connection()
            self.redis.rpush(key, value)
            logger.debug(f"Successfully enqueued item to queue '{key}'")
        except Exception as e:
            logger.error(f"Failed to enqueue to queue '{key}': {e}")
            # Reset connection flag to force reconnection on next attempt
            self._connection_checked = False
            raise ConnectionError(f"Redis enqueue operation failed: {e}") from e

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
