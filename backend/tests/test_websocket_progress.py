import asyncio

from fastapi.testclient import TestClient

from backend.app import app
from services.websocket_progress import websocket_manager


def test_websocket_progress_subscription() -> None:
    client = TestClient(app)

    with client.websocket_connect("/ws/progress?client_id=test-client") as websocket:
        handshake = websocket.receive_json()
        assert handshake["event"] == "connected"
        assert handshake["client_id"] == "test-client"

        websocket.send_json({"action": "subscribe", "job_id": "job-123"})
        ack = websocket.receive_json()
        assert ack["event"] == "subscribed"
        assert ack["job_id"] == "job-123"

        loop = asyncio.new_event_loop()
        try:
            loop.run_until_complete(
                websocket_manager.send_progress_update(
                    "job-123",
                    {
                        "job_id": "job-123",
                        "status": "processing",
                        "progress": 0.5,
                    },
                )
            )
        finally:
            loop.close()

        update = websocket.receive_json()
        assert update["job_id"] == "job-123"
        assert update["progress"] == 0.5

        websocket.send_json({"action": "unsubscribe", "job_id": "job-123"})
        ack = websocket.receive_json()
        assert ack["event"] == "unsubscribed"
