"""
Comprehensive WebSocket Connection Tests
Tests for real-time updates, connection management, and error handling
"""

import asyncio
import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import WebSocket, WebSocketDisconnect
from datetime import datetime

from services.websocket_progress import WebSocketProgressManager
from services.narration.orchestrator import NarrationOrchestrator


class MockWebSocket:
    """Mock WebSocket for testing."""

    def __init__(self, client_id: str = None):
        self.client_id = client_id or f"test-client-{id(self)}"
        self.accepted = False
        self.closed = False
        self.sent_messages = []
        self.receive_queue = asyncio.Queue()
        self.disconnect_on_send = False

    async def accept(self):
        self.accepted = True

    async def close(self, code: int = 1000):
        self.closed = True

    async def send_json(self, data: dict):
        if self.disconnect_on_send:
            raise ConnectionError("Connection lost")
        self.sent_messages.append(data)

    async def send_text(self, data: str):
        if self.disconnect_on_send:
            raise ConnectionError("Connection lost")
        self.sent_messages.append(data)

    async def receive_json(self):
        return await self.receive_queue.get()

    async def receive_text(self):
        return await self.receive_queue.get()


class TestWebSocketConnectionManagement:
    """Test WebSocket connection lifecycle and management."""

    @pytest.fixture
    def manager(self):
        return WebSocketProgressManager()

    @pytest.mark.asyncio
    async def test_connect_with_custom_client_id(self, manager):
        """Test connecting with a custom client ID."""
        websocket = MockWebSocket("custom-client-123")
        client_id = await manager.connect(websocket, "custom-client-123")

        assert client_id == "custom-client-123"
        assert websocket.accepted is True
        assert websocket.closed is False

    @pytest.mark.asyncio
    async def test_connect_generates_client_id(self, manager):
        """Test connecting without providing a client ID generates one."""
        websocket = MockWebSocket()
        client_id = await manager.connect(websocket, None)

        assert client_id is not None
        assert len(client_id) > 0
        assert websocket.accepted is True

    @pytest.mark.asyncio
    async def test_multiple_connections(self, manager):
        """Test managing multiple simultaneous connections."""
        websockets = [MockWebSocket(f"client-{i}") for i in range(5)]
        client_ids = []

        for i, ws in enumerate(websockets):
            client_id = await manager.connect(ws, f"client-{i}")
            client_ids.append(client_id)

        assert len(client_ids) == 5
        assert all(ws.accepted for ws in websockets)
        assert len(set(client_ids)) == 5  # All unique

    @pytest.mark.asyncio
    async def test_disconnect_removes_subscriptions(self, manager):
        """Test that disconnecting removes all client subscriptions."""
        websocket = MockWebSocket("disconnect-test")
        client_id = await manager.connect(websocket, "disconnect-test")

        # Subscribe to multiple jobs
        await manager.subscribe(client_id, "job-1")
        await manager.subscribe(client_id, "job-2")
        await manager.subscribe(client_id, "job-3")

        # Verify subscriptions exist
        await manager.send_progress_update("job-1", {"status": "test"})
        await manager.send_progress_update("job-2", {"status": "test"})
        await manager.send_progress_update("job-3", {"status": "test"})

        assert len(websocket.sent_messages) == 3

        # Disconnect
        await manager.disconnect(client_id)
        assert websocket.closed is True

        # Verify no more messages are sent
        websocket.sent_messages.clear()
        await manager.send_progress_update("job-1", {"status": "test"})
        await manager.send_progress_update("job-2", {"status": "test"})
        await manager.send_progress_update("job-3", {"status": "test"})

        assert len(websocket.sent_messages) == 0

    @pytest.mark.asyncio
    async def test_subscribe_to_nonexistent_job(self, manager):
        """Test subscribing to a job that doesn't exist yet."""
        websocket = MockWebSocket("subscriber")
        client_id = await manager.connect(websocket, "subscriber")

        # Should not raise an exception
        await manager.subscribe(client_id, "nonexistent-job")

        # Send update to the job
        await manager.send_progress_update("nonexistent-job", {"progress": 0.5})

        assert len(websocket.sent_messages) == 1
        assert websocket.sent_messages[0]["progress"] == 0.5


class TestWebSocketRealTimeUpdates:
    """Test real-time progress updates via WebSocket."""

    @pytest.fixture
    def manager(self):
        return WebSocketProgressManager()

    @pytest.mark.asyncio
    async def test_single_job_progress_updates(self, manager):
        """Test progress updates for a single job."""
        websocket = MockWebSocket("progress-client")
        client_id = await manager.connect(websocket, "progress-client")

        await manager.subscribe(client_id, "job-123")

        # Simulate progress updates
        updates = [
            {"job_id": "job-123", "progress": 0.0, "status": "starting"},
            {"job_id": "job-123", "progress": 0.25, "status": "processing"},
            {"job_id": "job-123", "progress": 0.5, "status": "processing"},
            {"job_id": "job-123", "progress": 0.75, "status": "processing"},
            {"job_id": "job-123", "progress": 1.0, "status": "completed"},
        ]

        for update in updates:
            await manager.send_progress_update("job-123", update)

        assert len(websocket.sent_messages) == 5
        for i, expected_update in enumerate(updates):
            assert websocket.sent_messages[i] == expected_update

    @pytest.mark.asyncio
    async def test_multiple_clients_same_job(self, manager):
        """Test multiple clients subscribed to the same job."""
        websockets = [MockWebSocket(f"client-{i}") for i in range(3)]
        client_ids = []

        # Connect all clients
        for i, ws in enumerate(websockets):
            client_id = await manager.connect(ws, f"client-{i}")
            client_ids.append(client_id)
            await manager.subscribe(client_id, "shared-job")

        # Send progress update
        update = {"job_id": "shared-job", "progress": 0.6, "status": "processing"}
        await manager.send_progress_update("shared-job", update)

        # All clients should receive the update
        for ws in websockets:
            assert len(ws.sent_messages) == 1
            assert ws.sent_messages[0] == update

    @pytest.mark.asyncio
    async def test_client_multiple_jobs(self, manager):
        """Test a single client subscribed to multiple jobs."""
        websocket = MockWebSocket("multi-job-client")
        client_id = await manager.connect(websocket, "multi-job-client")

        # Subscribe to multiple jobs
        job_ids = ["job-1", "job-2", "job-3"]
        for job_id in job_ids:
            await manager.subscribe(client_id, job_id)

        # Send updates to each job
        for i, job_id in enumerate(job_ids):
            update = {"job_id": job_id, "progress": 0.5, "step": f"step-{i}"}
            await manager.send_progress_update(job_id, update)

        # Client should receive all updates
        assert len(websocket.sent_messages) == 3
        for i, expected_job in enumerate(job_ids):
            assert websocket.sent_messages[i]["job_id"] == expected_job

    @pytest.mark.asyncio
    async def test_job_selective_broadcasting(self, manager):
        """Test that job updates only go to subscribed clients."""
        # Client 1 subscribed to job-1
        ws1 = MockWebSocket("client-1")
        client1 = await manager.connect(ws1, "client-1")
        await manager.subscribe(client1, "job-1")

        # Client 2 subscribed to job-2
        ws2 = MockWebSocket("client-2")
        client2 = await manager.connect(ws2, "client-2")
        await manager.subscribe(client2, "job-2")

        # Client 3 subscribed to both jobs
        ws3 = MockWebSocket("client-3")
        client3 = await manager.connect(ws3, "client-3")
        await manager.subscribe(client3, "job-1")
        await manager.subscribe(client3, "job-2")

        # Send update to job-1
        update1 = {"job_id": "job-1", "progress": 0.3}
        await manager.send_progress_update("job-1", update1)

        # Send update to job-2
        update2 = {"job_id": "job-2", "progress": 0.7}
        await manager.send_progress_update("job-2", update2)

        # Verify selective delivery
        assert len(ws1.sent_messages) == 1
        assert ws1.sent_messages[0] == update1

        assert len(ws2.sent_messages) == 1
        assert ws2.sent_messages[0] == update2

        assert len(ws3.sent_messages) == 2
        assert update1 in ws3.sent_messages
        assert update2 in ws3.sent_messages


class TestWebSocketErrorHandling:
    """Test WebSocket error handling and recovery."""

    @pytest.fixture
    def manager(self):
        return WebSocketProgressManager()

    @pytest.mark.asyncio
    async def test_connection_lost_during_send(self, manager):
        """Test handling when connection is lost during send."""
        websocket = MockWebSocket("lost-connection")
        websocket.disconnect_on_send = True

        client_id = await manager.connect(websocket, "lost-connection")
        await manager.subscribe(client_id, "job-123")

        # This should handle the connection loss gracefully
        await manager.send_progress_update("job-123", {"progress": 0.5})

        # WebSocket should be closed and removed from manager
        assert websocket.closed is True

    @pytest.mark.asyncio
    async def test_subscribe_without_connection(self, manager):
        """Test error when trying to subscribe without being connected."""
        with pytest.raises(RuntimeError, match="Client not connected"):
            await manager.subscribe("nonexistent-client", "job-123")

    @pytest.mark.asyncio
    async def test_unsubscribe_nonexistent_client(self, manager):
        """Test unsubscribing a client that doesn't exist (should not raise)."""
        # Should not raise an exception
        await manager.unsubscribe("nonexistent-client", "job-123")
        await manager.unsubscribe("nonexistent-client", None)

    @pytest.mark.asyncio
    async def test_send_to_empty_subscriptions(self, manager):
        """Test sending updates to jobs with no subscribers."""
        # Should not raise an exception
        await manager.send_progress_update("job-without-subscribers", {"progress": 0.5})

    @pytest.mark.asyncio
    async def test_broadcast_with_mixed_connections(self, manager):
        """Test broadcasting with some failed connections."""
        # Normal connection
        ws1 = MockWebSocket("normal-client")
        client1 = await manager.connect(ws1, "normal-client")

        # Failing connection
        ws2 = MockWebSocket("failing-client")
        ws2.disconnect_on_send = True
        client2 = await manager.connect(ws2, "failing-client")

        # Broadcast message
        message = {"event": "system-maintenance", "message": "System going down in 5 minutes"}
        await manager.broadcast_system_message(message)

        # Normal client should receive message
        assert len(ws1.sent_messages) == 1
        assert ws1.sent_messages[0] == message

        # Failing client should be closed
        assert ws2.closed is True


class TestWebSocketIntegration:
    """Integration tests for WebSocket with other services."""

    @pytest.fixture
    def manager(self):
        return WebSocketProgressManager()

    @pytest.mark.asyncio
    async def test_narration_orchestrator_integration(self, manager):
        """Test WebSocket integration with narration orchestrator."""
        websocket = MockWebSocket("orchestrator-client")
        client_id = await manager.connect(websocket, "orchestrator-client")

        await manager.subscribe(client_id, "narration-job-456")

        # Mock orchestrator progress update
        progress_data = {
            "job_id": "narration-job-456",
            "current_slide": 3,
            "total_slides": 10,
            "current_operation": "Generating TTS",
            "progress": 0.3,
            "estimated_time_remaining": 120,
            "stage": "synthesis"
        }

        await manager.send_progress_update("narration-job-456", progress_data)

        assert len(websocket.sent_messages) == 1
        assert websocket.sent_messages[0]["job_id"] == "narration-job-456"
        assert websocket.sent_messages[0]["progress"] == 0.3
        assert websocket.sent_messages[0]["current_slide"] == 3

    @pytest.mark.asyncio
    async def test_job_completion_flow(self, manager):
        """Test complete job flow with WebSocket updates."""
        websocket = MockWebSocket("completion-client")
        client_id = await manager.connect(websocket, "completion-client")

        await manager.subscribe(client_id, "complete-job-789")

        # Simulate complete job lifecycle
        job_updates = [
            {"job_id": "complete-job-789", "status": "queued", "progress": 0.0},
            {"job_id": "complete-job-789", "status": "extracting", "progress": 0.1, "current_slide": 1},
            {"job_id": "complete-job-789", "status": "refining", "progress": 0.3, "current_slide": 3},
            {"job_id": "complete-job-789", "status": "synthesizing", "progress": 0.7, "current_slide": 7},
            {"job_id": "complete-job-789", "status": "generating-subtitles", "progress": 0.9},
            {"job_id": "complete-job-789", "status": "completed", "progress": 1.0, "completed_at": datetime.now().isoformat()},
        ]

        for update in job_updates:
            await manager.send_progress_update("complete-job-789", update)

        # Verify all updates received
        assert len(websocket.sent_messages) == len(job_updates)

        # Verify final completion state
        final_message = websocket.sent_messages[-1]
        assert final_message["status"] == "completed"
        assert final_message["progress"] == 1.0
        assert "completed_at" in final_message

    @pytest.mark.asyncio
    async def test_concurrent_job_updates(self, manager):
        """Test handling concurrent updates to multiple jobs."""
        websocket = MockWebSocket("concurrent-client")
        client_id = await manager.connect(websocket, "concurrent-client")

        # Subscribe to multiple jobs
        job_ids = ["concurrent-job-1", "concurrent-job-2", "concurrent-job-3"]
        for job_id in job_ids:
            await manager.subscribe(client_id, job_id)

        # Send concurrent updates
        tasks = []
        for job_id in job_ids:
            for progress in [0.25, 0.5, 0.75, 1.0]:
                update = {"job_id": job_id, "progress": progress}
                tasks.append(manager.send_progress_update(job_id, update))

        # Execute all updates concurrently
        await asyncio.gather(*tasks)

        # Should receive all updates
        expected_updates = len(job_ids) * 4  # 3 jobs * 4 progress updates each
        assert len(websocket.sent_messages) == expected_updates

        # Verify progress updates for each job
        for job_id in job_ids:
            job_updates = [msg for msg in websocket.sent_messages if msg["job_id"] == job_id]
            assert len(job_updates) == 4
            progress_values = [update["progress"] for update in job_updates]
            assert progress_values == [0.25, 0.5, 0.75, 1.0]


class TestWebSocketPerformance:
    """Performance and stress tests for WebSocket connections."""

    @pytest.mark.asyncio
    async def test_many_connections_performance(self):
        """Test performance with many concurrent connections."""
        manager = WebSocketProgressManager()
        num_connections = 100

        # Create many connections
        websockets = []
        client_ids = []

        for i in range(num_connections):
            ws = MockWebSocket(f"perf-client-{i}")
            client_id = await manager.connect(ws, f"perf-client-{i}")
            websockets.append(ws)
            client_ids.append(client_id)

        # Subscribe all to a test job
        for client_id in client_ids:
            await manager.subscribe(client_id, "performance-job")

        # Send single update
        update = {"job_id": "performance-job", "progress": 0.5}
        start_time = datetime.now()
        await manager.send_progress_update("performance-job", update)
        end_time = datetime.now()

        # Verify all clients received the update
        for ws in websockets:
            assert len(ws.sent_messages) == 1
            assert ws.sent_messages[0] == update

        # Should complete quickly (less than 1 second for 100 connections)
        duration = (end_time - start_time).total_seconds()
        assert duration < 1.0

    @pytest.mark.asyncio
    async def test_high_frequency_updates(self):
        """Test handling high-frequency updates."""
        manager = WebSocketProgressManager()
        websocket = MockWebSocket("high-freq-client")
        client_id = await manager.connect(websocket, "high-freq-client")

        await manager.subscribe(client_id, "high-freq-job")

        # Send many updates rapidly
        num_updates = 1000
        tasks = []

        for i in range(num_updates):
            update = {"job_id": "high-freq-job", "progress": i / num_updates, "iteration": i}
            tasks.append(manager.send_progress_update("high-freq-job", update))

        # Execute all updates
        await asyncio.gather(*tasks)

        # Verify all updates received
        assert len(websocket.sent_messages) == num_updates

        # Verify progression
        for i, message in enumerate(websocket.sent_messages):
            assert message["iteration"] == i
            assert abs(message["progress"] - (i / num_updates)) < 0.001