from typing import Any

import pytest
from fastapi.testclient import TestClient

from services.tts_service.app import app
from services.tts_service.drivers.base import TTSEngine


def test_health_check() -> None:
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_synthesize_tts_basic(monkeypatch: pytest.MonkeyPatch) -> None:
    client = TestClient(app)

    class DummyDriver(TTSEngine):
        async def synthesize(
            self,
            text: str,
            voice: str = "en-US-AriaNeural",
            speed: float = 1.0,
            pitch: float = 0,
            output_format: str = "mp3",
            **kwargs: Any,
        ) -> dict[str, Any]:
            return {
                "audio_url": "/media/dummy.mp3",
                "voice_used": "en-US-AriaNeural",
                "output_format": "mp3",
            }

    # Patch driver registry
    from services.tts_service import app as tts_app

    tts_app.TTS_DRIVERS["azure"] = DummyDriver()

    payload = {"text": "Hello world"}
    response = client.post(
        "/synthesize",
        json=payload,
        headers={"Authorization": "Bearer test_token"},
    )
    assert response.status_code == 200
    assert response.json()["audio_url"].endswith(".mp3")
