FROM python:3.11-slim

WORKDIR /app

# System deps for audio and builds
RUN apt-get update && apt-get install -y \
    curl \
    gcc \
    g++ \
    git \
    libsndfile1 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY . .

RUN pip install --no-cache-dir --upgrade pip setuptools wheel

# Install PyTorch with CUDA 12.4 wheels (requires matching GPU runtime)
RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cu124 --extra-index-url https://pypi.org/simple \
    torch==2.6.0+cu124 torchaudio==2.6.0+cu124

# Preinstall deps expected by chatterbox (faster branch)
RUN pip install --no-cache-dir \
    numpy \
    resampy==0.4.3 \
    librosa \
    s3tokenizer \
    transformers==4.46.3 \
    diffusers==0.29.0 \
    resemble-perth==1.0.1 \
    omegaconf \
    conformer \
    safetensors \
    spacy-pkuseg \
    pykakasi==2.3.0 \
    soundfile>=0.12.1

# Install chatterbox from the faster branch without deps (we preinstalled them)
RUN pip install --no-cache-dir --no-deps git+https://github.com/rsxdalv/chatterbox.git@faster

# FastAPI runtime deps
RUN pip install --no-cache-dir \
    fastapi>=0.104.0 \
    uvicorn[standard]>=0.24.0

EXPOSE 4123

ENV EXAGGERATION=0.5
ENV CFG_WEIGHT=0.5
ENV TEMPERATURE=0.8
ENV VOICE_SAMPLE_PATH=/app/voice-sample.mp3

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "4123"]
