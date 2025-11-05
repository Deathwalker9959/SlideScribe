"""Tests for HTTP client utility module."""

from typing import Any
from unittest.mock import AsyncMock, patch

import aiohttp
import pytest

from shared.http_client import AsyncHTTPClient


class TestAsyncHTTPClient:
    """Test HTTP client functionality."""

    @pytest.mark.asyncio
    async def test_context_manager(self) -> None:
        """Test HTTP client as async context manager."""
        async with AsyncHTTPClient() as client:
            assert client.session is not None

    @pytest.mark.asyncio
    async def test_get_request(self) -> None:
        """Test GET request functionality."""
        mock_response_data: dict[str, Any] = {"status": "success", "data": "test"}

        with patch("aiohttp.ClientSession") as mock_session_class:
            mock_session = AsyncMock()
            mock_response = AsyncMock()
            mock_response.json.return_value = mock_response_data
            mock_response.raise_for_status.return_value = None
            mock_session.get.return_value.__aenter__.return_value = mock_response
            mock_session_class.return_value = mock_session

            async with AsyncHTTPClient() as client:
                result = await client.get("https://api.example.com/test")
                assert result == mock_response_data
                mock_session.get.assert_called_once_with(
                    "https://api.example.com/test", headers=None
                )

    @pytest.mark.asyncio
    async def test_get_request_with_headers(self) -> None:
        """Test GET request with custom headers."""
        mock_response_data: dict[str, Any] = {"data": "test"}
        headers: dict[str, Any] = {
            "Authorization": "Bearer token123",
            "Content-Type": "application/json",
        }

        with patch("aiohttp.ClientSession") as mock_session_class:
            mock_session = AsyncMock()
            mock_response = AsyncMock()
            mock_response.json.return_value = mock_response_data
            mock_response.raise_for_status.return_value = None
            mock_session.get.return_value.__aenter__.return_value = mock_response
            mock_session_class.return_value = mock_session

            async with AsyncHTTPClient() as client:
                result = await client.get("https://api.example.com/test", headers=headers)
                assert result == mock_response_data
                mock_session.get.assert_called_once_with(
                    "https://api.example.com/test", headers=headers
                )

    @pytest.mark.asyncio
    async def test_post_request(self) -> None:
        """Test POST request functionality."""
        mock_response_data: dict[str, Any] = {"id": 123, "status": "created"}
        post_data: dict[str, Any] = {"name": "test", "value": "data"}

        with patch("aiohttp.ClientSession") as mock_session_class:
            mock_session = AsyncMock()
            mock_response = AsyncMock()
            mock_response.json.return_value = mock_response_data
            mock_response.raise_for_status.return_value = None
            mock_session.post.return_value.__aenter__.return_value = mock_response
            mock_session_class.return_value = mock_session

            async with AsyncHTTPClient() as client:
                result = await client.post("https://api.example.com/create", data=post_data)
                assert result == mock_response_data
                mock_session.post.assert_called_once_with(
                    "https://api.example.com/create", json=post_data, headers=None
                )

    @pytest.mark.asyncio
    async def test_put_request(self) -> None:
        """Test PUT request functionality."""
        mock_response_data: dict[str, Any] = {"id": 123, "status": "updated"}
        put_data: dict[str, Any] = {"name": "updated", "value": "new_data"}

        with patch("aiohttp.ClientSession") as mock_session_class:
            mock_session = AsyncMock()
            mock_response = AsyncMock()
            mock_response.json.return_value = mock_response_data
            mock_response.raise_for_status.return_value = None
            mock_session.put.return_value.__aenter__.return_value = mock_response
            mock_session_class.return_value = mock_session

            async with AsyncHTTPClient() as client:
                result = await client.put("https://api.example.com/update/123", data=put_data)
                assert result == mock_response_data
                mock_session.put.assert_called_once_with(
                    "https://api.example.com/update/123", json=put_data, headers=None
                )

    @pytest.mark.asyncio
    async def test_delete_request(self) -> None:
        """Test DELETE request functionality."""
        mock_response_data: dict[str, Any] = {"status": "deleted"}

        with patch("aiohttp.ClientSession") as mock_session_class:
            mock_session = AsyncMock()
            mock_response = AsyncMock()
            mock_response.json.return_value = mock_response_data
            mock_response.raise_for_status.return_value = None
            mock_session.delete.return_value.__aenter__.return_value = mock_response
            mock_session_class.return_value = mock_session

            async with AsyncHTTPClient() as client:
                result = await client.delete("https://api.example.com/delete/123")
                assert result == mock_response_data
                mock_session.delete.assert_called_once_with(
                    "https://api.example.com/delete/123", headers=None
                )

    @pytest.mark.asyncio
    async def test_not_initialized_error(self) -> None:
        """Test error when client not used as context manager."""
        client = AsyncHTTPClient()
        with pytest.raises(RuntimeError, match="HTTP client not initialized"):
            await client.get("https://api.example.com/test")

    @pytest.mark.asyncio
    async def test_http_error_status(self) -> None:
        """Test HTTP error status handling."""
        with patch("aiohttp.ClientSession") as mock_session_class:
            mock_session = AsyncMock()
            mock_response = AsyncMock()
            mock_response.raise_for_status.side_effect = aiohttp.ClientResponseError(
                request_info=AsyncMock(), history=(), status=404
            )
            mock_session.get.return_value.__aenter__.return_value = mock_response
            mock_session_class.return_value = mock_session

            async with AsyncHTTPClient() as client:
                with pytest.raises(aiohttp.ClientResponseError):
                    await client.get("https://api.example.com/notfound")
