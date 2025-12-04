FROM python:3.13-slim

WORKDIR /app

# System dependencies (minimal build deps + ffmpeg for audio conversions)
RUN apt-get update && apt-get install -y \
    curl \
    gcc \
    g++ \
    git \
    libpq-dev \
    pkg-config \
    python3-dev \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Create necessary directories
RUN mkdir -p /app/media /app/voice_profiles /app/analytics_exports

# Copy application code
COPY . .

# Install Python dependencies with prebuilt wheels
RUN pip install --no-cache-dir --upgrade pip setuptools wheel

# Install FastAPI and web framework dependencies
RUN pip install --no-cache-dir \
    fastapi>=0.104.0 \
    uvicorn[standard]>=0.24.0 \
    python-multipart>=0.0.6 \
    aiohttp>=3.9.0

# Install auth and security packages
RUN pip install --no-cache-dir \
    "python-jose[cryptography]>=3.3.0" \
    "passlib[bcrypt]>=1.7.4"

# Install database and storage packages
RUN pip install --no-cache-dir \
    redis>=5.0.0 \
    psycopg2-binary>=2.9.9 \
    sqlalchemy>=2.0.23 \
    asyncpg>=0.29.0 \
    alembic>=1.13.0

# Install remaining dependencies
RUN pip install --no-cache-dir \
    "pydantic[email]>=2.5.0" \
    pyyaml>=6.0.1 \
    openai>=1.3.0 \
    python-dotenv>=1.0.0 \
    pytest>=7.4.3 \
    requests>=2.31.0

ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["python", "app.py"]
