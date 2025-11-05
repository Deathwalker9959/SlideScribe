from fastapi.testclient import TestClient

from services.ai_refinement.app import app

client = TestClient(app)


def test_login_success():
    response = client.post("/token", data={"username": "testuser", "password": "testpass"})
    assert response.status_code == 200
    assert "access_token" in response.json()


def test_login_failure():
    response = client.post("/token", data={"username": "wrong", "password": "wrong"})
    assert response.status_code == 400


def test_protected_route():
    login = client.post("/token", data={"username": "testuser", "password": "testpass"})
    token = login.json()["access_token"]
    response = client.get("/users/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json()["username"] == "testuser"
