"""
SlideScribe Backend - Unified Application Entry Point
Mounts all microservices under a single FastAPI application
"""

from uuid import uuid4

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from services.ai_refinement import app as ai_refinement_module
from services.analytics.app import app as analytics_app
from services.audio_processing.app import app as audio_processing_app
from services.auth import router as auth_router
from services.auth_service import router as auth_service_router
from services.image_analysis import app as image_analysis_module
from services.narration import app as narration_module
from services.ssml_builder import app as ssml_builder_module
from services.subtitles import app as subtitles_module
from services.tts_service import app as tts_module
from services.websocket_progress import websocket_manager
from services.voice_profiles import app as voice_profiles_app_instance
from shared.utils import config, setup_logging

logger = setup_logging("slidescribe-backend")

# Get routers from the service apps
ai_refinement_app = ai_refinement_module.app
analytics_app = analytics_app
narration_app = narration_module.app
subtitles_app = subtitles_module.app
tts_app = tts_module.app
image_analysis_app = image_analysis_module.app
voice_profiles_app = voice_profiles_app_instance
ssml_builder_app = ssml_builder_module.app

app = FastAPI(
    title="SlideScribe Backend API",
    description="""
    Unified API for PowerPoint AI refinement and Text-to-Speech services.

    All endpoints are documented below. Service routes are organized by tag.
    """,
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_tags=[
        {
            "name": "Authentication",
            "description": "User authentication and token management",
        },
        {
            "name": "Health",
            "description": "Service health and status endpoints",
        },
        {
            "name": "AI Refinement",
            "description": "Text refinement service - mounted at /api/v1/ai-refinement",
        },
        {
            "name": "Text-to-Speech",
            "description": "TTS service - mounted at /api/v1/tts",
        },
        {
            "name": "Narration",
            "description": "Narration processing service - mounted at /api/v1/narration",
        },
        {
            "name": "Image Analysis",
            "description": "Slide visual analysis service - mounted at /api/v1/image-analysis",
        },
        {
            "name": "Subtitles",
            "description": "Subtitle generation service - mounted at /api/v1/subtitles",
        },
        {
            "name": "Voice Profiles",
            "description": "Voice profile management service - mounted at /api/v1/voice-profiles",
        },
        {
            "name": "Audio Processing",
            "description": "Audio processing service - mounted at /api/v1/audio",
        },
        {
            "name": "SSML Builder",
            "description": "SSML generation and pronunciation lexicon service - mounted at /api/v1/ssml",
        },
        {
            "name": "Analytics",
            "description": "Telemetry collection and export service for thesis research - mounted at /api/v1/analytics",
        },
    ],
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.get("allowed_origins", ["*"]),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, tags=["Authentication"])
app.include_router(auth_service_router, prefix="/api/v1/auth", tags=["Authentication"])

# Routes to exclude (internal FastAPI docs routes)
EXCLUDED_PATHS = {"/openapi.json", "/docs", "/docs/oauth2-redirect", "/redoc"}

# Include AI Refinement routes with prefix
for route in ai_refinement_app.routes:
    if hasattr(route, "path") and hasattr(route, "endpoint"):
        # Skip internal documentation routes
        if route.path in EXCLUDED_PATHS:
            continue
        route_kwargs = {
            "path": f"/api/v1/ai-refinement{route.path}",
            "endpoint": route.endpoint,
            "methods": route.methods,
            "tags": ["AI Refinement"],
        }
        if hasattr(route, "name"):
            route_kwargs["name"] = f"ai_{route.name}"
        if hasattr(route, "response_model"):
            route_kwargs["response_model"] = route.response_model
        app.add_api_route(**route_kwargs)

# Include TTS routes with prefix
for route in tts_app.routes:
    if hasattr(route, "path") and hasattr(route, "endpoint"):
        # Skip internal documentation routes
        if route.path in EXCLUDED_PATHS:
            continue
        route_kwargs = {
            "path": f"/api/v1/tts{route.path}",
            "endpoint": route.endpoint,
            "methods": route.methods,
            "tags": ["Text-to-Speech"],
        }
        if hasattr(route, "name"):
            route_kwargs["name"] = f"tts_{route.name}"
        if hasattr(route, "response_model"):
            route_kwargs["response_model"] = route.response_model
        app.add_api_route(**route_kwargs)

# Include Narration routes with prefix
for route in narration_app.routes:
    if hasattr(route, "path") and hasattr(route, "endpoint"):
        # Skip internal documentation routes
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

# Include Subtitles routes with prefix
for route in subtitles_app.routes:
    if hasattr(route, "path") and hasattr(route, "endpoint"):
        # Skip internal documentation routes
        if route.path in EXCLUDED_PATHS:
            continue
        route_kwargs = {
            "path": f"/api/v1/subtitles{route.path}",
            "endpoint": route.endpoint,
            "methods": route.methods,
            "tags": ["Subtitles"],
        }
        if hasattr(route, "name"):
            route_kwargs["name"] = f"subtitles_{route.name}"
        if hasattr(route, "response_model"):
            route_kwargs["response_model"] = route.response_model
        app.add_api_route(**route_kwargs)

# Include Voice Profile routes with prefix
for route in voice_profiles_app.routes:
    if hasattr(route, "path") and hasattr(route, "endpoint"):
        if route.path in EXCLUDED_PATHS:
            continue
        route_kwargs = {
            "path": f"/api/v1/voice-profiles{route.path}",
            "endpoint": route.endpoint,
            "methods": route.methods,
            "tags": ["Voice Profiles"],
        }
        if hasattr(route, "name"):
            route_kwargs["name"] = f"voice_profiles_{route.name}"
        if hasattr(route, "response_model"):
            route_kwargs["response_model"] = route.response_model
        app.add_api_route(**route_kwargs)

# Include Image Analysis routes with prefix
for route in image_analysis_app.routes:
    if hasattr(route, "path") and hasattr(route, "endpoint"):
        if route.path in EXCLUDED_PATHS:
            continue
        route_kwargs = {
            "path": f"/api/v1/image-analysis{route.path}",
            "endpoint": route.endpoint,
            "methods": route.methods,
            "tags": ["Image Analysis"],
        }
        if hasattr(route, "name"):
            route_kwargs["name"] = f"image_analysis_{route.name}"
        if hasattr(route, "response_model"):
            route_kwargs["response_model"] = route.response_model
        app.add_api_route(**route_kwargs)

# Include Audio Processing routes with prefix
for route in audio_processing_app.routes:
    if hasattr(route, "path") and hasattr(route, "endpoint"):
        if route.path in EXCLUDED_PATHS:
            continue
        route_kwargs = {
            "path": f"/api/v1/audio{route.path}",
            "endpoint": route.endpoint,
            "methods": route.methods,
            "tags": ["Audio Processing"],
        }
        if hasattr(route, "name"):
            route_kwargs["name"] = f"audio_{route.name}"
        if hasattr(route, "response_model"):
            route_kwargs["response_model"] = route.response_model
        app.add_api_route(**route_kwargs)

# Include SSML Builder routes with prefix
for route in ssml_builder_app.routes:
    if hasattr(route, "path") and hasattr(route, "endpoint"):
        if route.path in EXCLUDED_PATHS:
            continue
        route_kwargs = {
            "path": f"/api/v1/ssml{route.path}",
            "endpoint": route.endpoint,
            "methods": route.methods,
            "tags": ["SSML Builder"],
        }
        if hasattr(route, "name"):
            route_kwargs["name"] = f"ssml_{route.name}"
        if hasattr(route, "response_model"):
            route_kwargs["response_model"] = route.response_model
        app.add_api_route(**route_kwargs)

# Include Analytics routes with prefix
for route in analytics_app.routes:
    if hasattr(route, "path") and hasattr(route, "endpoint"):
        if route.path in EXCLUDED_PATHS:
            continue
        route_kwargs = {
            "path": f"/api/v1/analytics{route.path}",
            "endpoint": route.endpoint,
            "methods": route.methods,
            "tags": ["Analytics"],
        }
        if hasattr(route, "name"):
            route_kwargs["name"] = f"analytics_{route.name}"
        if hasattr(route, "response_model"):
            route_kwargs["response_model"] = route.response_model
        app.add_api_route(**route_kwargs)


@app.websocket("/ws/progress")
async def websocket_progress_endpoint(websocket: WebSocket):
    """WebSocket endpoint for narration progress updates."""
    client_id = websocket.query_params.get("client_id")
    assigned_client_id = await websocket_manager.connect(websocket, client_id)
    await websocket.send_json({"event": "connected", "client_id": assigned_client_id})

    try:
        while True:
            message = await websocket.receive_json()
            action = message.get("action")

            if action == "subscribe":
                job_id = message.get("job_id")
                if not job_id:
                    await websocket.send_json(
                        {"event": "error", "message": "Missing job_id for subscribe"}
                    )
                    continue
                await websocket_manager.subscribe(assigned_client_id, job_id)
                await websocket.send_json({"event": "subscribed", "job_id": job_id})
            elif action == "unsubscribe":
                job_id = message.get("job_id")
                await websocket_manager.unsubscribe(assigned_client_id, job_id)
                await websocket.send_json({"event": "unsubscribed", "job_id": job_id})
            elif action == "ping":
                await websocket.send_json({"event": "pong"})
            else:
                await websocket.send_json(
                    {"event": "error", "message": f"Unknown action: {action}"}
                )
    except WebSocketDisconnect:
        await websocket_manager.disconnect(assigned_client_id)
    except Exception:
        await websocket_manager.disconnect(assigned_client_id)
        raise


@app.get("/", tags=["Health"])
async def root():
    """Root endpoint with service information and API navigation"""
    return {
        "service": "SlideScribe Backend API",
        "version": "1.0.0",
        "services": {
            "ai_refinement": {
                "base_url": "/api/v1/ai-refinement",
                "docs": "/api/v1/ai-refinement/docs",
                "health": "/api/v1/ai-refinement/health",
            },
            "tts": {
                "base_url": "/api/v1/tts",
                "docs": "/api/v1/tts/docs",
                "health": "/api/v1/tts/health",
            },
            "narration": {
                "base_url": "/api/v1/narration",
                "docs": "/api/v1/narration/docs",
                "health": "/api/v1/narration/health",
            },
            "subtitles": {
                "base_url": "/api/v1/subtitles",
                "docs": "/api/v1/subtitles/docs",
                "health": "/api/v1/subtitles/health",
            },
            "voice_profiles": {
                "base_url": "/api/v1/voice-profiles",
                "docs": "/api/v1/voice-profiles/docs",
                "health": "/api/v1/voice-profiles/health",
            },
            "audio_processing": {
                "base_url": "/api/v1/audio",
                "docs": "/api/v1/audio/docs",
                "health": "/api/v1/audio/health",
            },
            "ssml_builder": {
                "base_url": "/api/v1/ssml",
                "docs": "/api/v1/ssml/docs",
                "health": "/api/v1/ssml/health",
            },
            "analytics": {
                "base_url": "/api/v1/analytics",
                "docs": "/api/v1/analytics/docs",
                "health": "/api/v1/analytics/health",
            },
            "auth": {
                "token_endpoint": "/token",
            },
        },
        "documentation": {
            "swagger_ui": "/docs",
            "redoc": "/redoc",
            "openapi_json": "/openapi.json",
        },
    }


@app.get("/health", tags=["Health"])
async def health_check():
    """Health check endpoint for all services"""
    return {
        "status": "healthy",
        "services": {
            "api_gateway": "operational",
            "ai_refinement": "operational",
            "tts": "operational",
            "narration": "operational",
            "subtitles": "operational",
            "voice_profiles": "operational",
            "audio_processing": "operational",
            "ssml_builder": "operational",
            "analytics": "operational",
        },
    }


if __name__ == "__main__":
    import uvicorn

    logger.info("Starting SlideScribe Backend on http://0.0.0.0:8000")
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True, log_level="info")
