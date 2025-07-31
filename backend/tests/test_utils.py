from typing import List
from backend.shared.utils import generate_hash, sanitize_filename, chunk_text, config


def test_config_env_loading() -> None:
    # These should be set in .env
    assert config.get("openai_api_key") is not None
    assert config.get("azure_speech_key") is not None
    assert config.get("database_url") is not None
    assert isinstance(config.get("allowed_origins"), list)


def test_generate_hash() -> None:
    text = "hello world"
    h = generate_hash(text)
    assert isinstance(h, str)
    assert len(h) == 32


def test_sanitize_filename() -> None:
    fname = "bad:file/name?.mp3"
    safe = sanitize_filename(fname)
    assert ":" not in safe and "/" not in safe and "?" not in safe


def test_chunk_text() -> None:
    text = "word " * 200
    chunks: List[str] = chunk_text(text, max_length=50)
    assert all(len(c) <= 50 for c in chunks)
    assert sum(len(c) for c in chunks) == len(text)
