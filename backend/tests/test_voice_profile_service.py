"""Tests for the voice profile management service."""

import asyncio
from typing import Generator

import pytest
from fastapi.testclient import TestClient

from services.voice_profiles.app import app
from services.voice_profiles.manager import VoiceProfileManager


@pytest.fixture
def client(tmp_path) -> Generator[TestClient, None, None]:
    """Provide a test client with isolated voice profile storage."""
    original_manager = app.state.voice_profile_manager
    storage_path = tmp_path / "voice_profiles.json"
    test_manager = VoiceProfileManager(storage_path=str(storage_path))
    app.state.voice_profile_manager = test_manager

    with TestClient(app) as test_client:
        yield test_client

    # Cleanup and restore original manager
    asyncio.run(test_manager.delete_all())
    app.state.voice_profile_manager = original_manager


def _auth_headers() -> dict[str, str]:
    return {"Authorization": "Bearer test-token"}


def test_health_check(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["service"] == "voice-profiles"


def test_create_and_get_profile(client: TestClient) -> None:
    profile_payload = {
        "name": "Default Narrator",
        "description": "Friendly professional narration voice",
        "voice": "en-US-AriaNeural",
        "language": "en-US",
        "style": "narration-professional",
        "speed": 1.05,
        "pitch": 0.0,
        "volume": 1.0,
        "sample_text": "Welcome to this presentation.",
        "tags": ["default", "presentation"],
    }

    create_response = client.post("/create", json=profile_payload, headers=_auth_headers())
    assert create_response.status_code == 201
    created_profile = create_response.json()
    profile_id = created_profile["id"]
    assert created_profile["name"] == "Default Narrator"
    assert created_profile["voice"] == "en-US-AriaNeural"

    get_response = client.get(f"/{profile_id}", headers=_auth_headers())
    assert get_response.status_code == 200
    fetched_profile = get_response.json()
    assert fetched_profile["id"] == profile_id
    assert fetched_profile["tags"] == ["default", "presentation"]


def test_list_and_update_profiles(client: TestClient) -> None:
    payload = {
        "name": "Energetic Host",
        "voice": "en-US-DavisNeural",
        "language": "en-US",
        "speed": 1.2,
        "pitch": 2.0,
        "volume": 1.1,
        "tags": ["energetic"],
    }
    create_response = client.post("/create", json=payload, headers=_auth_headers())
    assert create_response.status_code == 201
    profile_id = create_response.json()["id"]

    list_response = client.get("/list", headers=_auth_headers())
    assert list_response.status_code == 200
    profiles = list_response.json()
    assert any(profile["id"] == profile_id for profile in profiles)

    update_payload = {
        "speed": 1.15,
        "tags": ["energetic", "marketing"],
    }
    update_response = client.put(f"/{profile_id}", json=update_payload, headers=_auth_headers())
    assert update_response.status_code == 200
    updated_profile = update_response.json()
    assert pytest.approx(updated_profile["speed"], rel=1e-3) == 1.15
    assert updated_profile["tags"] == ["energetic", "marketing"]


def test_apply_profile_generates_tts_request(client: TestClient) -> None:
    payload = {
        "name": "Calm Guide",
        "voice": "en-GB-LibbyNeural",
        "language": "en-GB",
        "speed": 0.95,
        "pitch": -1.0,
        "volume": 0.9,
    }
    create_response = client.post("/create", json=payload, headers=_auth_headers())
    profile_id = create_response.json()["id"]

    apply_payload = {"text": "This is the narration content."}
    apply_response = client.post(
        f"/apply/{profile_id}", json=apply_payload, headers=_auth_headers()
    )

    assert apply_response.status_code == 200
    tts_request = apply_response.json()
    assert tts_request["text"] == "This is the narration content."
    assert tts_request["voice"] == "en-GB-LibbyNeural"
    assert pytest.approx(tts_request["speed"], rel=1e-3) == 0.95
    assert pytest.approx(tts_request["pitch"], rel=1e-3) == -1.0


def test_duplicate_profile_names_not_allowed(client: TestClient) -> None:
    payload = {
        "name": "Unique Voice",
        "voice": "en-US-AriaNeural",
        "language": "en-US",
    }
    response_one = client.post("/create", json=payload, headers=_auth_headers())
    assert response_one.status_code == 201

    response_two = client.post("/create", json=payload, headers=_auth_headers())
    assert response_two.status_code == 400
    assert "already exists" in response_two.json()["detail"]
