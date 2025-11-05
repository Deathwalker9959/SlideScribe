# SlideScribe Backend

Unified backend API for PowerPoint AI refinement and Text-to-Speech services.

## Quick Start

### 1. Setup Environment

```powershell
# Create (or update) the conda environment
conda env create -f environment.yml

# Initialise conda for your shell if activation fails
conda init bash
source ~/.bashrc

# Activate the project environment
conda activate slidescribe

# Install backend package in editable mode
pip install -e .

# (Non-interactive alternative)
conda run -n slidescribe pytest --help
```

### 2. Configure Environment Variables

Create a `.env` file in the backend root:

```env
OPENAI_API_KEY=sk-your-openai-key
AZURE_SPEECH_KEY=your-azure-speech-key
AZURE_SPEECH_REGION=eastus
DATABASE_URL=sqlite:///./slidescribe.db
REDIS_URL=redis://localhost:6379/0
MEDIA_ROOT=./media
SECRET_KEY=your-secret-key-here
ALLOWED_ORIGINS=["*"]
DEBUG=true
```

### 3. Initialize Database

```powershell
# Run database migrations
alembic upgrade head

# (Optional) Seed test user for development
python dev_scripts/seed_db.py
```

### 4. Run the Backend

#### Option A: Run All Services Together (Recommended)

```powershell
# From backend root directory
python app.py
```

This starts the unified API gateway at **http://localhost:8000** with all services mounted:
- AI Refinement: `http://localhost:8000/api/v1/ai-refinement`
- TTS Service: `http://localhost:8000/api/v1/tts`
- API Docs: `http://localhost:8000/docs`

#### Option B: Run Services Individually

```powershell
# AI Refinement Service (port 8001)
cd services/ai_refinement
uvicorn backend.services.ai_refinement.app:app --reload --port 8001

# TTS Service (port 8002)
cd services/tts_service
uvicorn backend.services.tts_service.app:app --reload --port 8002
```

#### Option C: Docker Compose

```powershell
docker-compose up --build
```

Services available at:
- API Gateway: `http://localhost:8000`
- AI Refinement: `http://localhost:8001`
- TTS Service: `http://localhost:8002`
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`

## API Endpoints

### Authentication
- `POST /token` - Get JWT access token

### AI Refinement Service
- `POST /api/v1/ai-refinement/refine` - Refine text
- `GET /api/v1/ai-refinement/refinement-types` - Get available refinement types
- `POST /api/v1/ai-refinement/batch-refine` - Batch refine multiple texts

### TTS Service
- `POST /api/v1/tts/synthesize` - Convert text to speech

### Health & Documentation
- `GET /` - Service information
- `GET /health` - Health check all services
- `GET /docs` - Interactive API documentation (Swagger UI)
- `GET /redoc` - Alternative API documentation (ReDoc)

## Testing

```powershell
# Run all tests inside the conda environment
conda run -n slidescribe pytest tests/ -v

# Run specific test file
conda run -n slidescribe pytest tests/test_ai_refinement.py -v

# Run with coverage
conda run -n slidescribe pytest --cov=backend tests/
```

## Architecture

```
backend/
├── app.py                  # Main unified application entry point
├── shared/                 # Shared utilities and models
│   ├── models.py          # Pydantic models for API contracts
│   ├── utils.py           # Common utilities (Cache, HTTP client, etc.)
│   └── config.py          # Environment configuration
├── services/
│   ├── ai_refinement/     # AI text refinement service
│   │   ├── app.py         # FastAPI endpoints
│   │   ├── service.py     # Business logic
│   │   ├── config/        # YAML configuration
│   │   └── drivers/       # AI provider drivers (OpenAI, Azure)
│   ├── tts_service/       # Text-to-speech service
│   │   ├── app.py         # FastAPI endpoints
│   │   └── drivers/       # TTS engine drivers (Azure)
│   ├── auth.py            # JWT authentication
│   └── queue.py           # Redis queue manager
└── tests/                 # Test suite
```

## Development

### Adding Dependencies

```powershell
# Add to environment.yml, then update environment
conda env update -f environment.yml --prune
```

### Code Style

- Use `backend.` prefix for all imports
- Follow async/await patterns for I/O operations
- Use Pydantic models for request/response validation
- Add type hints to all functions

### Common Issues

**Import Errors**: Make sure you've installed the package in editable mode:
```powershell
pip install -e .
```

**Missing Environment Variables**: Check that `.env` file exists and contains all required keys.

**Port Already in Use**: Stop other services or change the port:
```powershell
uvicorn backend.app:app --port 8001
```

## License

Proprietary - SlideScribe Project
