from fastapi.testclient import TestClient

from services.ai_refinement.app import app


def test_health_check():
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["message"].lower().find("healthy") != -1


def test_refine_text_basic():
    client = TestClient(app)
    payload = {
        "text": "This is a test sentence with error.",
        "refinement_type": "grammar",
        "language": "en",
    }
    login = client.post("/token", data={"username": "testuser", "password": "testpass"})
    token = login.json()["access_token"]
    response = client.post("/refine", json=payload, headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert "refined_text" in response.json()
