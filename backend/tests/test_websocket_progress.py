import pytest

from services.websocket_progress import WebSocketProgressManager


class StubWebSocket:
    def __init__(self) -> None:
        self.accepted = False
        self.closed = False
        self.sent_messages = []

    async def accept(self) -> None:
        self.accepted = True

    async def close(self) -> None:
        self.closed = True

    async def send_json(self, message: dict) -> None:
        self.sent_messages.append(message)


@pytest.mark.asyncio
async def test_websocket_manager_handles_unknown_jobs() -> None:
    manager = WebSocketProgressManager()
    websocket = StubWebSocket()

    client_id = await manager.connect(websocket, "client-test")
    assert websocket.accepted is True

    await manager.subscribe(client_id, "job-existing")

    await manager.send_progress_update("job-missing", {"job_id": "job-missing"})
    assert websocket.sent_messages == []

    await manager.unsubscribe(client_id, "job-missing")
    await manager.send_progress_update("job-existing", {"job_id": "job-existing"})
    assert websocket.sent_messages == [{"job_id": "job-existing"}]

    await manager.disconnect(client_id)
    assert websocket.closed is True


@pytest.mark.asyncio
async def test_websocket_manager_broadcast_and_unsubscribe() -> None:
    manager = WebSocketProgressManager()
    websocket = StubWebSocket()
    client_id = await manager.connect(websocket, None)
    await manager.subscribe(client_id, "job-456")

    await manager.send_progress_update("job-456", {"job_id": "job-456", "progress": 0.25})
    assert websocket.sent_messages == [{"job_id": "job-456", "progress": 0.25}]

    await manager.unsubscribe(client_id, "job-456")
    await manager.send_progress_update("job-456", {"job_id": "job-456", "progress": 0.5})
    assert len(websocket.sent_messages) == 1

    await manager.broadcast_system_message({"event": "ping"})
    assert websocket.sent_messages[-1] == {"event": "ping"}
