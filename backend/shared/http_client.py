"""
HTTP client utilities for inter-service communication.
"""

import asyncio
from typing import Any

import aiohttp


class AsyncHTTPClient:
    """Async HTTP client for inter-service communication."""

    def __init__(self, timeout: int = 30) -> None:
        """Initialize HTTP client."""
        self.timeout = aiohttp.ClientTimeout(total=timeout)
        self.session: aiohttp.ClientSession | None = None

    async def __aenter__(self) -> "AsyncHTTPClient":
        """Enter async context manager."""
        self.session = aiohttp.ClientSession(timeout=self.timeout)
        return self

    async def __aexit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        """Exit async context manager."""
        if self.session:
            await self.session.close()

    @staticmethod
    async def _prepare_request(coro_or_ctx: Any) -> Any:
        """Normalize aiohttp request result to an async context manager."""
        if asyncio.iscoroutine(coro_or_ctx):
            return await coro_or_ctx
        return coro_or_ctx

    @staticmethod
    async def _ensure_response_ok(response: Any) -> None:
        """Invoke raise_for_status, awaiting when necessary."""
        result = response.raise_for_status()
        if asyncio.iscoroutine(result):
            await result

    async def get(self, url: str, headers: dict[str, Any] | None = None) -> dict[str, Any]:
        """Perform GET request."""
        if not self.session:
            raise RuntimeError("HTTP client not initialized. Use async context manager.")

        request_ctx = await self._prepare_request(self.session.get(url, headers=headers))
        async with request_ctx as response:
            await self._ensure_response_ok(response)
            return await response.json()

    async def post(
        self,
        url: str,
        data: dict[str, Any] | None = None,
        headers: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Perform POST request."""
        if not self.session:
            raise RuntimeError("HTTP client not initialized. Use async context manager.")

        request_ctx = await self._prepare_request(
            self.session.post(url, json=data, headers=headers)
        )
        async with request_ctx as response:
            await self._ensure_response_ok(response)
            return await response.json()

    async def put(
        self,
        url: str,
        data: dict[str, Any] | None = None,
        headers: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Perform PUT request."""
        if not self.session:
            raise RuntimeError("HTTP client not initialized. Use async context manager.")

        request_ctx = await self._prepare_request(
            self.session.put(url, json=data, headers=headers)
        )
        async with request_ctx as response:
            await self._ensure_response_ok(response)
            return await response.json()

    async def delete(self, url: str, headers: dict[str, Any] | None = None) -> dict[str, Any]:
        """Perform DELETE request."""
        if not self.session:
            raise RuntimeError("HTTP client not initialized. Use async context manager.")

        request_ctx = await self._prepare_request(self.session.delete(url, headers=headers))
        async with request_ctx as response:
            await self._ensure_response_ok(response)
            return await response.json()
