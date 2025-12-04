import os
import io
import re
import threading
from pathlib import Path
from typing import List, Optional

import numpy as np
import soundfile as sf
import torch
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator

from chatterbox.mtl_tts import ChatterboxMultilingualTTS, SUPPORTED_LANGUAGES

app = FastAPI(title="Chatterbox TTS API", version="1.0.0")

MODEL = None
MODEL_LOCK = threading.Lock()


def _detect_device() -> str:
    try:
        return os.getenv("DEVICE", "auto") if os.getenv("DEVICE") else ("cuda" if torch.cuda.is_available() else "cpu")
    except Exception:
        return "cpu"


def _patch_torch_load_for_cpu():
    """Force torch.load to map to CPU when CUDA is unavailable to avoid deserialization errors."""
    if torch.cuda.is_available():
        return
    orig_load = torch.load

    def _load_cpu(*args, **kwargs):
        if "map_location" not in kwargs:
            kwargs["map_location"] = "cpu"
        return orig_load(*args, **kwargs)

    torch.load = _load_cpu


def _load_model():
    global MODEL
    if MODEL is None:
        with MODEL_LOCK:
            if MODEL is None:
                _patch_torch_load_for_cpu()
                device = _detect_device()
                MODEL = ChatterboxMultilingualTTS.from_pretrained(device)
                if hasattr(MODEL, "to") and str(getattr(MODEL, "device", "")) != device:
                    MODEL.to(device)
    return MODEL


class SpeechRequest(BaseModel):
    input: str = Field(..., min_length=1, max_length=3000)
    voice: Optional[str] = Field(default=None)
    response_format: Optional[str] = Field(default="wav")
    speed: Optional[float] = Field(default=None)
    exaggeration: Optional[float] = Field(default=None, ge=0.25, le=2.0)
    cfg_weight: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    temperature: Optional[float] = Field(default=None, ge=0.05, le=5.0)
    language: Optional[str] = Field(default=None, pattern="^[a-z]{2}(-[A-Z]{2})?$")
    voice_sample_path: Optional[str] = None

    @field_validator("input")
    @classmethod
    def trim_input(cls, v: str) -> str:
        return v.strip()


def _chunk_text(text: str, max_chunk: int) -> List[str]:
    if len(text) <= max_chunk:
        return [text]
    sentences = re.split(r'(?<=[.!?]) +', text)
    chunks: List[str] = []
    current = ""
    for s in sentences:
        s = s.strip()
        if not s:
            continue
        if len(current) + len(s) + 1 <= max_chunk:
            current = f"{current} {s}".strip()
        else:
            if current:
                chunks.append(current)
            if len(s) <= max_chunk:
                current = s
            else:
                # hard split long sentence
                for i in range(0, len(s), max_chunk):
                    chunks.append(s[i:i + max_chunk])
                current = ""
    if current:
        chunks.append(current)
    return chunks


@app.on_event("startup")
def startup_event():
    _load_model()


@app.get("/health")
def health():
    model_loaded = MODEL is not None
    device = getattr(MODEL, "device", None)
    return {
        "status": "healthy",
        "model_loaded": model_loaded,
        "device": str(device),
        "config": {
            "max_chunk_length": int(os.getenv("MAX_CHUNK_LENGTH", "280")),
            "max_total_length": int(os.getenv("MAX_TOTAL_LENGTH", "3000")),
            "voice_sample_path": os.getenv("VOICE_SAMPLE_PATH", "./voice-sample.mp3"),
            "default_exaggeration": float(os.getenv("EXAGGERATION", "0.5")),
            "default_cfg_weight": float(os.getenv("CFG_WEIGHT", "0.5")),
            "default_temperature": float(os.getenv("TEMPERATURE", "0.8")),
        },
    }


@app.get("/config")
def config_info():
    return {
        "server": {
            "host": os.getenv("HOST", "0.0.0.0"),
            "port": int(os.getenv("PORT", "4123")),
        },
        "model": {
            "device": str(getattr(MODEL, "device", None)) if MODEL else None,
            "voice_sample_path": os.getenv("VOICE_SAMPLE_PATH", "./voice-sample.mp3"),
            "model_cache_dir": os.getenv("MODEL_CACHE_DIR", "./models"),
        },
        "defaults": {
            "exaggeration": float(os.getenv("EXAGGERATION", "0.5")),
            "cfg_weight": float(os.getenv("CFG_WEIGHT", "0.5")),
            "temperature": float(os.getenv("TEMPERATURE", "0.8")),
            "max_chunk_length": int(os.getenv("MAX_CHUNK_LENGTH", "280")),
            "max_total_length": int(os.getenv("MAX_TOTAL_LENGTH", "3000")),
        },
    }


@app.get("/v1/models")
def list_models():
    return {
        "object": "list",
        "data": [
            {
                "id": "chatterbox-tts-1",
                "object": "model",
                "owned_by": "resemble-ai",
            }
        ],
    }


@app.post("/v1/audio/speech")
def generate_speech(req: SpeechRequest):
    model = _load_model()
    max_total = int(os.getenv("MAX_TOTAL_LENGTH", "3000"))
    max_chunk = int(os.getenv("MAX_CHUNK_LENGTH", "280"))

    text = req.input.strip()
    if len(text) > max_total:
        text = text[:max_total]

    lang = req.language or os.getenv("LANGUAGE", "en")
    lang_id = lang.split("-")[0]
    if lang_id not in SUPPORTED_LANGUAGES:
        raise HTTPException(status_code=400, detail=f"Unsupported language '{lang}'")

    exaggeration = req.exaggeration
    if exaggeration is None:
        if req.speed is not None:
            exaggeration = 0.5 * float(req.speed)
        else:
            exaggeration = float(os.getenv("EXAGGERATION", "0.5"))

    cfg_weight = req.cfg_weight
    if cfg_weight is None:
        cfg_weight = float(os.getenv("CFG_WEIGHT", "0.5"))

    temperature = req.temperature
    if temperature is None:
        temperature = float(os.getenv("TEMPERATURE", "0.8"))

    voice_sample_path = req.voice_sample_path or os.getenv("VOICE_SAMPLE_PATH")
    if voice_sample_path:
        voice_sample_path = str(Path(voice_sample_path))

    # Chunk text and synth each chunk, then concatenate
    chunks = _chunk_text(text, max_chunk)
    audio_segments = []
    for chunk in chunks:
        wav = model.generate(
            chunk[:300],
            language_id=lang_id,
            audio_prompt_path=voice_sample_path,
            exaggeration=exaggeration,
            cfg_weight=cfg_weight,
            temperature=temperature,
        )
        audio_segments.append(wav.squeeze(0).numpy())

    combined = np.concatenate(audio_segments, axis=-1)
    memfile = io.BytesIO()
    sf.write(memfile, combined, model.sr, format="WAV")
    memfile.seek(0)

    return StreamingResponse(
        memfile,
        media_type="audio/wav",
        headers={"X-Sample-Rate": str(model.sr)},
    )
