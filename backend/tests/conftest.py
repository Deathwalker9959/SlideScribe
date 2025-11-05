import asyncio
import os
import sys
from pathlib import Path
from typing import Callable, Generator

import bcrypt
import pytest
from fastapi import Request
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

ROOT_DIR = Path(__file__).resolve().parents[1]
PROJECT_ROOT = ROOT_DIR.parent
for path in (PROJECT_ROOT, ROOT_DIR):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

from database import Base, get_db
from models.database.user import User
from services.ai_refinement.app import app as ai_app
from fastapi import HTTPException
from services.auth import oauth2_scheme, router as auth_router
from services.image_analysis.app import app as image_analysis_app, service as image_analysis_service
from services.narration.app import app as narration_app, orchestrator as narration_orchestrator
from services.queue import redis as redis_module
from services.subtitles.app import app as subtitles_app
from services.tts_service.app import app as tts_app
from services.voice_profiles.app import (
    app as voice_profiles_app,
    manager as voice_profile_manager,
)
from services.websocket_progress import websocket_manager
from shared.utils import config as service_config, ensure_directory

SERVICE_APPS = [ai_app, narration_app, subtitles_app, tts_app, voice_profiles_app, image_analysis_app]


@pytest.fixture(scope="session")
def session_factory(tmp_path_factory: pytest.TempPathFactory) -> Callable[[], Generator]:
    """Create a SQLite session factory for tests."""
    db_dir = tmp_path_factory.mktemp("slidescribe-db")
    db_path = db_dir / "test.db"
    engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)

    SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)

    # Seed default test user
    with SessionLocal() as session:
        if not session.query(User).filter(User.username == "testuser").first():
            hashed_password = bcrypt.hashpw(
                "testpass".encode("utf-8"), bcrypt.gensalt()
            ).decode("utf-8")
            session.add(
                User(
                    username="testuser",
                    email="testuser@example.com",
                    hashed_password=hashed_password,
                )
            )
            session.commit()

    def _session_generator() -> Generator:
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    return _session_generator


@pytest.fixture(scope="session", autouse=True)
def attach_auth_routes() -> None:
    """Ensure authentication routes are available on service apps for testing."""
    for service_app in SERVICE_APPS:
        if not any(getattr(route, "path", "") == "/token" for route in service_app.routes):
            service_app.include_router(auth_router)


@pytest.fixture(scope="session", autouse=True)
def fake_redis() -> Generator[None, None, None]:
    """Patch redis client to use in-memory storage for tests."""
    original_from_url = redis_module.Redis.from_url

    class DummyRedis:
        def __init__(self) -> None:
            self._store: dict[str, list[str]] = {}

        def rpush(self, key: str, value: str) -> None:
            self._store.setdefault(key, []).append(value)

        def lpop(self, key: str):
            queue = self._store.get(key)
            if not queue:
                return None
            value = queue.pop(0)
            if not queue:
                self._store.pop(key, None)
            return value

        def llen(self, key: str) -> int:
            return len(self._store.get(key, []))

    def fake_from_url(cls, url: str, *args, **kwargs):  # type: ignore[unused-argument]
        return DummyRedis()

    redis_module.Redis.from_url = classmethod(fake_from_url)  # type: ignore[assignment]
    try:
        yield
    finally:
        redis_module.Redis.from_url = original_from_url  # type: ignore[assignment]


@pytest.fixture(autouse=True)
def test_environment(tmp_path: Path, session_factory: Callable[[], Generator]) -> Generator:
    """Configure environment variables, dependency overrides, and storage paths per-test."""
    media_root = tmp_path / "media"
    ensure_directory(str(media_root))

    voice_profile_storage = tmp_path / "voice_profiles.json"

    os.environ["MEDIA_ROOT"] = str(media_root)
    os.environ["VOICE_PROFILE_STORAGE"] = str(voice_profile_storage)

    service_config.set("media_root", str(media_root))
    service_config.set("voice_profile_storage", str(voice_profile_storage))

    narration_orchestrator.media_root = media_root
    ensure_directory(str(narration_orchestrator.media_root))

    voice_profile_manager.storage_path = voice_profile_storage
    ensure_directory(str(voice_profile_storage.parent))
    voice_profile_manager._profiles.clear()
    voice_profile_manager._cache.clear()
    if voice_profile_storage.exists():
        voice_profile_storage.unlink()
    image_analysis_service.reset()

    def _get_test_db():
        yield from session_factory()

    # Reset WebSocket manager between tests to avoid leakage
    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(websocket_manager.reset())
    finally:
        loop.close()

    async def fake_oauth2(request: Request) -> str:
        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.lower().startswith("bearer "):
            raise HTTPException(status_code=401, detail="Not authenticated")
        return auth_header.split(" ", 1)[1]

    for service_app in SERVICE_APPS:
        service_app.dependency_overrides[get_db] = _get_test_db
        service_app.dependency_overrides[oauth2_scheme] = fake_oauth2

    try:
        yield
    finally:
        for service_app in SERVICE_APPS:
            service_app.dependency_overrides.pop(get_db, None)
            service_app.dependency_overrides.pop(oauth2_scheme, None)
