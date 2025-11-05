# Backend Agent Roles & Workflow

This document defines AI agent roles for contributing to the SlideScribe backend (Python 3.13+ FastAPI narration assistant).

---

## Role Definitions

### 🗺️ Planner

**Goal**: Analyze requirements and decompose them into actionable backend tasks.

**Inputs to Read**:
- `.github/copilot-instructions.md` — Architecture, patterns, Day-1 commands
- `pyproject.toml` — Dependencies, Python 3.13 target
- `services/ai_refinement/config/refinement_config.yaml` — Existing pipeline definitions
- Feature request (user story, issue, or PR description)

**Allowed Commands**:
- Search repo: `glob`, `grep` for file patterns, class names, API endpoints
- Read files: `pyproject.toml`, `app.py`, service app files, schema files
- No modifications; information-gathering only

**Success Criteria**:
✅ Identify existing modules/endpoints that satisfy the requirement (avoid duplication)
✅ List new files/modules needed (if any)
✅ Propose where in architecture (which service, which driver, which pipeline step)
✅ Flag dependencies (external APIs, DB schema, queue setup)
✅ Estimate 1–3 tasks for Builder to execute sequentially

**Example Breakdown**:
> **Requirement**: "Add Coqui TTS as an alternative to Azure"
> 1. ✅ Existing: `services/tts_service/drivers/base.py` has `TTSEngine` ABC; registry in `app.py:16–22`.
> 2. 📋 New module: `services/tts_service/drivers/coqui.py` (CoquiTTSEngine subclass)
> 3. 🔧 Change: Register in `app.py` TTS_DRIVERS dict (3 lines)
> 4. ✅ No DB schema changes, no queue changes
> 5. 🧪 Task: Write driver, test with `pytest tests/test_tts_service.py -v`

---

### 🏗️ Builder

**Goal**: Implement tasks designed by Planner using project patterns and conventions.

**Inputs to Read**:
- `.github/copilot-instructions.md` — Patterns, Do/Don'ts
- Planner's task breakdown
- Relevant source files (drivers, service layer, models)
- Tests to understand expected behavior

**Allowed Commands**:
- Read/write/edit files via Edit, Write tools
- Run builds: `pytest`, `ruff check`, `mypy`
- Run servers: `python app.py`, `uvicorn`, Docker (if available)
- Git: `git status`, `git add`, `git commit` (if asked)
- Bash: any setup/runtime commands

**Success Criteria**:
✅ Code follows ruff/mypy (100-char line, double quotes, type hints)
✅ Async/await properly used (no sync I/O in handlers)
✅ Config loaded via `config.get()`, no hardcoded secrets
✅ Pydantic schemas used for requests/responses
✅ Tests pass: `pytest tests/ -v`
✅ No breaking changes to existing endpoints (verify via TestClient)

**Example Implementation**:
> Create `services/tts_service/drivers/coqui.py`:
> ```python
> import asyncio
> from .base import TTSEngine
>
> class CoquiTTSEngine(TTSEngine):
>     async def synthesize(self, text: str, voice: str, **kwargs) -> dict:
>         loop = asyncio.get_event_loop()
>         # Wrap sync Coqui call in executor
>         audio_bytes = await loop.run_in_executor(
>             None, self._coqui_tts, text, voice
>         )
>         return {"audio_data": audio_bytes, "format": "wav"}
>
>     @staticmethod
>     def _coqui_tts(text: str, voice: str) -> bytes:
>         # Sync Coqui TTS wrapper
>         from TTS.api import TTS
>         model = TTS(model_name="tts_models/en/ljspeech/glow-tts", ...)
>         return model.tts(text)
> ```
>
> Update `services/tts_service/app.py`:
> ```python
> from services.tts_service.drivers.coqui import CoquiTTSEngine
> TTS_DRIVERS["coqui"] = CoquiTTSEngine()
> ```
>
> Run: `pytest tests/test_tts_service.py::test_synthesize -v`

---

### 🔍 Reviewer

**Goal**: Enforce code quality, repo patterns, and verify backward compatibility.

**Inputs to Read**:
- `.github/copilot-instructions.md` — Repo-specific rules
- `pyproject.toml:44–157` — Ruff, mypy, pytest config
- Builder's code changes
- Existing tests + new tests (if added)

**Allowed Commands**:
- Read modified files (via git diff or Read tool)
- Run linters: `ruff check <files>`, `ruff format --check`
- Type check: `mypy <dirs>`
- Run tests: `pytest <path> -v`
- Run API tests: `python -c "from fastapi.testclient import TestClient; ..."` (verify endpoints)
- No modifications (suggest fixes via comment)

**Success Criteria**:
✅ **Ruff pass**: `ruff check` reports no errors (E, W, F, I, N, UP, B, C4, SIM, RUF)
✅ **Type pass**: `mypy shared/ services/ models/` (allow `--ignore-missing-imports`)
✅ **Test pass**: `pytest tests/ -v` (100% green, no flaky tests)
✅ **Backward compat**: No changes to existing endpoint signatures or response schemas
✅ **Docs updated**: If new endpoint, ensure `.github/copilot-instructions.md` reflects it (or flag for Planner)
✅ **No hardcoded secrets**: Grep `.py` files for API keys, passwords
✅ **Async verified**: No sync I/O in handlers; all external calls awaited

**Checklist (automated or manual)**:
```bash
# Reviewer's commands
ruff check services/ shared/ models/
ruff format --check services/ shared/ models/
mypy shared/ services/ models/ --ignore-missing-imports
pytest tests/ -v --tb=short
# Manual: Review for Do/Don'ts from copilot-instructions.md
```

---

### ⚙️ Worker Ops

**Goal**: Set up job queues, monitor workers, ensure integration with external services.

**Inputs to Read**:
- `.github/copilot-instructions.md` — Integration checklist, Redis/DB setup
- `services/queue.py` — QueueManager implementation
- `alembic/` — Migration scripts
- `.env.example` — Required environment variables
- Docker Compose (if available) — Service orchestration

**Allowed Commands**:
- Query Redis: `redis-cli` (list keys, lengths, debug)
- Database: `alembic upgrade/downgrade`, `psql` (query tables, debug)
- Monitor logs: `docker logs`, `tail -f /app/logs`
- Health checks: `curl http://localhost:8000/health`
- Queue inspect: Read `services/queue.py` and verify QueueManager methods

**Success Criteria**:
✅ **Redis available**: `redis-cli ping` returns PONG
✅ **DB migrations applied**: `alembic current` matches latest version
✅ **API gateway responds**: `GET /health` → 200 OK
✅ **All services healthy**: `/health` shows all services "operational"
✅ **External APIs configured**: `OPENAI_API_KEY`, `AZURE_SPEECH_KEY` set in `.env`
✅ **Media storage writable**: `MEDIA_ROOT` directory exists and is writable by app process
✅ **Async jobs work**: Queue enqueue/dequeue tested with QueueManager

**Example Setup**:
```bash
# 1. Start Redis (Docker)
docker run -d --name redis -p 6379:6379 redis:7

# 2. Configure .env
cp .env.example .env
# Edit REDIS_URL, OPENAI_API_KEY, AZURE_SPEECH_KEY, DATABASE_URL

# 3. Run migrations
alembic upgrade head

# 4. Start app
python app.py

# 5. Verify health
curl http://localhost:8000/health
# Expected: {"status": "healthy", "services": {...}}

# 6. Test queue
python -c "
from services.queue import QueueManager
qm = QueueManager()
qm.enqueue('test_queue', 'test_job')
print(qm.dequeue('test_queue'))  # Expect: 'test_job'
"
```

---

## First Task Script: Add "Export Narration" Endpoint

This script demonstrates how all four agent roles contribute to adding a **new endpoint** that exports a presentation with narration + subtitles.

### Phase 1: Planner ✅ Analyzes & Designs

**Input**: Feature request: "Add endpoint `POST /api/v1/narration/export` to create an PPTX file with synthesized speech and .srt subtitles."

**Analysis**:
1. ✅ **Existing patterns**:
   - TTS synthesis: `services/tts_service/app.py:50–66` (POST /synthesize)
   - Subtitle models: `shared/models.py:66–85` (SubtitleEntry, SubtitleResponse)
   - Export models: `shared/models.py:103–117` (ExportRequest, ExportResponse)
   - MEDIA_ROOT: `app.py:14`, config system in `shared/config.py`

2. 🆕 **New code needed**:
   - New FastAPI endpoint: `POST /api/v1/narration/export` in a new service `services/narration/app.py`
   - Service layer: `services/narration/service.py` orchestrating TTS + subtitle sync + export
   - Helper function to write .srt files to disk

3. 🔧 **Changes**:
   - Mount narration service in main `app.py` (5 lines, same pattern as TTS/AI refinement)
   - Add `ExportNarrationRequest` schema to `shared/models.py` (if not existing)

4. 📦 **Dependencies**:
   - `pptx` library (python-pptx) to read/write PPTX
   - No new DB schema (use existing AudioFile + ExportResponse models)
   - No external APIs beyond OpenAI (TTS) which is already used

5. ✅ **Order**:
   - Task 1 (Builder): Create `services/narration/service.py` with export logic
   - Task 2 (Builder): Create `services/narration/app.py` with endpoint
   - Task 3 (Builder): Update main `app.py` to mount narration routes
   - Task 4 (Reviewer): Lint, type check, test
   - Task 5 (Worker Ops): Verify MEDIA_ROOT permissions, test export pipeline

---

### Phase 2: Builder 🏗️ Implements

**Task 1**: Create narration service orchestration

📝 **File**: `services/narration/service.py` (new)

```python
"""Narration orchestration: TTS synthesis + subtitle sync + PPTX export."""

import time
from pathlib import Path

from fastapi import HTTPException
from pydantic import BaseModel

from shared.config import config
from shared.models import ExportRequest, ExportResponse, SubtitleEntry, SubtitleResponse
from shared.utils import ensure_directory, generate_hash, setup_logging
from services.tts_service.drivers.azure import AzureTTSEngine

logger = setup_logging("narration-service")


class NarrationExportService:
    """Orchestrate TTS synthesis, subtitle generation, and PPTX export."""

    def __init__(self):
        azure_key = config.get("azure_speech_key")
        azure_region = config.get("azure_speech_region")
        self.tts_engine = AzureTTSEngine(azure_key, azure_region)
        self.media_root = Path(config.get("media_root", "./media"))
        ensure_directory(str(self.media_root))

    async def export_narration(self, request: ExportRequest) -> ExportResponse:
        """Export presentation with narration and subtitles."""
        start_time = time.time()
        try:
            export_id = generate_hash(f"{request.presentation_id}_{int(time.time())}")
            export_dir = self.media_root / export_id
            export_dir.mkdir(parents=True, exist_ok=True)

            # 1. Synthesize TTS from presentation text
            # (In production, iterate over slides and synthesize each)
            slide_text = "This is a sample slide."  # Would come from request
            tts_result = await self.tts_engine.synthesize(
                text=slide_text,
                voice="en-US-AriaNeural",
                output_format="wav",
            )
            audio_file = export_dir / f"{export_id}_audio.wav"
            audio_file.write_bytes(tts_result.get("audio_data", b""))

            # 2. Generate subtitles (simplified: split text into chunks)
            subtitles = self._generate_subtitles(slide_text)
            srt_file = export_dir / f"{export_id}.srt"
            self._write_srt(srt_file, subtitles)

            # 3. Export PPTX with embedded audio & subtitles
            # (Placeholder: would use python-pptx to modify PPTX)
            output_pptx = export_dir / f"{export_id}.pptx"
            output_pptx.touch()  # Simulate export

            logger.info(f"Exported narration {export_id} in {time.time() - start_time:.2f}s")
            return ExportResponse(
                export_id=export_id,
                download_url=f"/media/{export_id}/{export_id}.pptx",
                file_size=output_pptx.stat().st_size,
                export_format="pptx",
                created_at=None,  # Would set real timestamp
                expires_at=None,  # Would calculate expiry
            )
        except Exception as e:
            logger.error(f"Export failed: {e!s}")
            raise HTTPException(status_code=500, detail=f"Export failed: {e!s}") from e

    def _generate_subtitles(self, text: str, chunk_size: int = 50) -> list[SubtitleEntry]:
        """Split text into subtitle chunks with timing."""
        words = text.split()
        chunks = [" ".join(words[i : i + chunk_size]) for i in range(0, len(words), chunk_size)]
        subtitles = []
        for idx, chunk in enumerate(chunks):
            subtitles.append(
                SubtitleEntry(
                    index=idx + 1,
                    start_time=float(idx * 5),  # Assume 5 seconds per chunk
                    end_time=float((idx + 1) * 5),
                    text=chunk,
                )
            )
        return subtitles

    def _write_srt(self, file_path: Path, subtitles: list[SubtitleEntry]) -> None:
        """Write subtitles to .srt file."""
        srt_content = ""
        for sub in subtitles:
            srt_content += (
                f"{sub.index}\n"
                f"{self._seconds_to_srt_time(sub.start_time)} --> "
                f"{self._seconds_to_srt_time(sub.end_time)}\n"
                f"{sub.text}\n\n"
            )
        file_path.write_text(srt_content, encoding="utf-8")

    @staticmethod
    def _seconds_to_srt_time(seconds: float) -> str:
        """Convert seconds to SRT timestamp format (HH:MM:SS,mmm)."""
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        secs = int(seconds % 60)
        millis = int((seconds % 1) * 1000)
        return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"
```

**Task 2**: Create narration endpoint

📝 **File**: `services/narration/app.py` (new)

```python
"""Narration service: TTS + subtitle sync + export."""

from fastapi import Depends, FastAPI

from services.auth import oauth2_scheme
from services.narration.service import NarrationExportService
from shared.models import ExportRequest, ExportResponse
from shared.utils import setup_logging

logger = setup_logging("narration-service")

app = FastAPI(
    title="Narration Service",
    description="Synthesize narration and export presentations with audio + subtitles",
    version="1.0.0",
)

export_service = NarrationExportService()


@app.post("/export", response_model=ExportResponse)
async def export_narration(
    request: ExportRequest, token: str = Depends(oauth2_scheme)
) -> ExportResponse:
    """Export presentation with synthesized narration and subtitles."""
    return await export_service.export_narration(request)


@app.get("/health")
async def health():
    """Health check."""
    return {"status": "ok", "service": "narration"}
```

**Task 3**: Mount in main app

📝 **File**: `app.py` (modify)

Add import at top:
```python
from services.narration import app as narration_module
```

Add to route mounting (after TTS routes, before closing):
```python
narration_app = narration_module.app

# Include Narration routes with prefix
for route in narration_app.routes:
    if hasattr(route, "path") and hasattr(route, "endpoint"):
        if route.path in EXCLUDED_PATHS:
            continue
        route_kwargs = {
            "path": f"/api/v1/narration{route.path}",
            "endpoint": route.endpoint,
            "methods": route.methods,
            "tags": ["Narration"],
        }
        if hasattr(route, "name"):
            route_kwargs["name"] = f"narration_{route.name}"
        if hasattr(route, "response_model"):
            route_kwargs["response_model"] = route.response_model
        app.add_api_route(**route_kwargs)
```

Also add to `openapi_tags`:
```python
{
    "name": "Narration",
    "description": "Narration synthesis and export - mounted at /api/v1/narration",
},
```

And to root endpoint services dict:
```python
"narration": {
    "base_url": "/api/v1/narration",
    "health": "/api/v1/narration/health",
},
```

---

### Phase 3: Reviewer 🔍 Quality Gates

**Commands**:
```bash
# 1. Lint
ruff check services/narration/ shared/models.py app.py
ruff format --check services/narration/ shared/models.py app.py

# 2. Type check
mypy services/narration/ --ignore-missing-imports

# 3. Test
pytest tests/ -v

# 4. Verify endpoint (manual)
# Start app: python app.py
# Call: curl -H "Authorization: Bearer <TOKEN>" \
#         -X POST http://localhost:8000/api/v1/narration/export \
#         -H "Content-Type: application/json" \
#         -d '{"presentation_id": "test123", "export_format": "pptx"}'

# 5. Check backward compat
# Ensure existing endpoints still respond correctly:
# - GET /health
# - POST /token
# - POST /api/v1/ai-refinement/refine
# - POST /api/v1/tts/synthesize
```

**Checklist**:
- ✅ No `B008` violations (FastAPI `Depends` is exempt)
- ✅ Type hints on all functions
- ✅ No hardcoded `AZURE_SPEECH_KEY` (uses `config.get()`)
- ✅ All I/O awaited (`await self.tts_engine.synthesize(...)`)
- ✅ Tests pass (write test file `tests/test_narration_service.py`)
- ✅ Endpoint mounted in main app (verify `/docs` shows `/api/v1/narration/export`)

---

### Phase 4: Worker Ops ⚙️ Integration & Deployment

**Setup**:
```bash
# 1. Ensure MEDIA_ROOT exists and is writable
mkdir -p ./media
chmod 755 ./media

# 2. Verify Azure Speech configured
export AZURE_SPEECH_KEY="<key>"
export AZURE_SPEECH_REGION="eastus"

# 3. Start services
python app.py

# 4. Health check
curl http://localhost:8000/health
# Expected: {"status": "healthy", "services": {"api_gateway": "operational", ...}}

# 5. Test narration export (with valid JWT token)
TOKEN=$(curl -X POST http://localhost:8000/token \
  -d "username=testuser&password=testpass" | jq -r .access_token)
curl -X POST http://localhost:8000/api/v1/narration/export \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"presentation_id": "test123", "export_format": "pptx"}'

# 6. Verify media files created
ls -la ./media/*/

# 7. Monitor logs
tail -f /path/to/logs (or docker logs if containerized)
```

---

## Agent Workflow Summary

| Phase | Role | Input | Output | Verify |
|-------|------|-------|--------|--------|
| Design | **Planner** | Requirement | Task list, architecture review | No implementation; design is sound |
| Code | **Builder** | Task list, examples | Implemented files, passing tests | Tests green; code adheres to patterns |
| QA | **Reviewer** | Builder's code | Linting/type/test reports | No ruff/mypy errors; tests 100% pass |
| Deploy | **Worker Ops** | Reviewer's approval | Running services, verified integrations | Health checks pass; jobs execute correctly |

---

## Quick Reference: Key Patterns by Service

### AI Refinement
- **Entry**: `services/ai_refinement/app.py:39–47`
- **Logic**: `services/ai_refinement/service.py:77–114`
- **Config**: `services/ai_refinement/config/refinement_config.yaml` (YAML-driven)
- **Pattern**: Request → Cache check → YAML pipeline steps → OpenAI calls → Quality scoring → Response

### TTS
- **Entry**: `services/tts_service/app.py:50–66`
- **Drivers**: `services/tts_service/drivers/{azure,openai_tts}.py`
- **Registry**: `services/tts_service/app.py:16–22`
- **Pattern**: Request → Driver lookup → Async synthesis → File storage → Response URL

### Narration (New Example)
- **Entry**: `services/narration/app.py:25–32`
- **Logic**: `services/narration/service.py:28–42`
- **Pattern**: Request → TTS synthesis + subtitle generation + PPTX modification → Export file → Response

---

## Notes for Agents

- **Always read** `.github/copilot-instructions.md` before starting any task.
- **Async first**: Every I/O operation (API calls, DB queries, file writes) must use `async`/`await`.
- **Config only via `config.get()`**: Never hardcode secrets or env-dependent values.
- **Test as you code**: Run `pytest tests/ -v` after each major change.
- **File organization**: New features go in `services/{new_service}/`; shared code goes in `shared/`.
- **Communicate**: If a requirement conflicts with repo patterns, flag it in Planner phase—don't hack around it.

---

**Last Updated**: 2025-10-31 | Backend v0.1.0 | Python 3.13+
