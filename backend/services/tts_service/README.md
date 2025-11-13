# TTS Service

This service provides text-to-speech (TTS) synthesis using a pluggable driver architecture. The default driver is Azure Cognitive Services, but you can add more providers easily.

## Endpoints

- `POST /synthesize` — Synthesize speech from text (see `app.py`)
- `GET /health` — Health check

## Adding a New TTS Provider

1. Implement a new driver in `drivers/` inheriting from `TTSEngine` (see `drivers/base.py`).
2. Register your driver in `app.py` in the `TTS_DRIVERS` dictionary.

## Environment Variables

- `AZURE_SPEECH_KEY` — Azure API key
- `AZURE_SPEECH_REGION` — Azure region (e.g., eastus)
- `MEDIA_ROOT` — Directory to store audio files (default: `/app/media`)

## Running Locally

```bash
cd backend/services/tts-service
pip install -r requirements.txt
uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

## Docker

```bash
docker build -t tts-service .
docker run -p 8002:8000 --env-file ../../.env tts-service
```
