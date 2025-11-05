"""WebSocket progress manager for real-time narration job updates."""

from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import Any, Dict, Set, Tuple
from uuid import uuid4

from fastapi import WebSocket


class WebSocketProgressManager:
    """Track WebSocket connections and job subscriptions."""

    def __init__(self) -> None:
        self._connections: Dict[str, WebSocket] = {}
        self._job_subscriptions: Dict[str, Set[str]] = defaultdict(set)
        self._client_jobs: Dict[str, Set[str]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket, client_id: str | None = None) -> str:
        """Accept WebSocket connection and register client."""
        client_key = client_id or str(uuid4())
        await websocket.accept()
        async with self._lock:
            self._connections[client_key] = websocket
        return client_key

    async def disconnect(self, client_id: str) -> None:
        """Remove client connection and subscriptions."""
        websocket: WebSocket | None = None
        async with self._lock:
            websocket = self._connections.pop(client_id, None)
            subscribed_jobs = self._client_jobs.pop(client_id, set())
            for job_id in subscribed_jobs:
                subscribers = self._job_subscriptions.get(job_id)
                if subscribers:
                    subscribers.discard(client_id)
                    if not subscribers:
                        self._job_subscriptions.pop(job_id, None)
        if websocket:
            await websocket.close()

    async def subscribe(self, client_id: str, job_id: str) -> None:
        """Subscribe a client to a specific job."""
        async with self._lock:
            if client_id not in self._connections:
                raise RuntimeError("Client not connected")
            self._job_subscriptions[job_id].add(client_id)
            self._client_jobs[client_id].add(job_id)

    async def unsubscribe(self, client_id: str, job_id: str | None = None) -> None:
        """Unsubscribe a client from a job or from all jobs."""
        async with self._lock:
            if client_id not in self._connections:
                return

            if job_id is None:
                job_ids = list(self._client_jobs.get(client_id, set()))
            else:
                job_ids = [job_id]

            for jid in job_ids:
                subscribers = self._job_subscriptions.get(jid)
                if subscribers:
                    subscribers.discard(client_id)
                    if not subscribers:
                        self._job_subscriptions.pop(jid, None)
            if job_id is None:
                self._client_jobs.pop(client_id, None)
            else:
                self._client_jobs.get(client_id, set()).discard(job_id)

    async def send_progress_update(self, job_id: str, progress_data: dict[str, Any]) -> None:
        """Send progress update to all subscribers of a job."""
        recipients: list[Tuple[str, WebSocket]] = []
        async with self._lock:
            client_ids = list(self._job_subscriptions.get(job_id, set()))
            for client_id in client_ids:
                websocket = self._connections.get(client_id)
                if websocket:
                    recipients.append((client_id, websocket))

        for client_id, websocket in recipients:
            try:
                await websocket.send_json(progress_data)
            except Exception:
                await self.disconnect(client_id)

    async def broadcast_system_message(self, message: dict[str, Any]) -> None:
        """Broadcast a message to all connected clients."""
        async with self._lock:
            recipients = list(self._connections.items())

        for client_id, websocket in recipients:
            try:
                await websocket.send_json(message)
            except Exception:
                await self.disconnect(client_id)

    async def reset(self) -> None:
        """Clear all connections and subscriptions (primarily for tests)."""
        async with self._lock:
            connections = list(self._connections.items())
            self._connections.clear()
            self._job_subscriptions.clear()
            self._client_jobs.clear()

        for client_id, websocket in connections:
            try:
                await websocket.close()
            except Exception:
                pass


# Shared manager instance
websocket_manager = WebSocketProgressManager()
