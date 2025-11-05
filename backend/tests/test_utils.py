from shared.utils import chunk_text, config, generate_hash, sanitize_filename


def test_config_env_loading() -> None:
    # Keys should resolve even when not explicitly configured
    assert config.get("openai_api_key") in (None, "",) or isinstance(
        config.get("openai_api_key"), str
    )
    assert config.get("azure_speech_key") in (None, "",) or isinstance(
        config.get("azure_speech_key"), str
    )
    assert config.get("database_url") in (None, "") or isinstance(config.get("database_url"), str)
    allowed_origins = config.get("allowed_origins")
    assert isinstance(allowed_origins, list)


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
    chunks: list[str] = chunk_text(text, max_length=50)
    assert all(len(c) <= 50 for c in chunks)
    assert sum(len(c) for c in chunks) == len(text)
