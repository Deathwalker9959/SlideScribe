from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import sys
import time
import openai
import re
import json
from typing import List

from backend.shared.models import TextRefinementRequest, TextRefinementResponse, APIResponse, ErrorResponse
from backend.shared.utils import setup_logging, generate_hash, Cache, validate_text_length, config
from backend.services.ai_refinement.service import TextRefinementService

# Import YAML configuration
from backend.services.ai_refinement.config.config_loader import config as refinement_config

# Initialize logging
logger = setup_logging("ai-refinement-service")

# Initialize FastAPI app
app = FastAPI(
    title="AI Text Refinement Service",
    description="Intelligent text refinement for PowerPoint presentations",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.get('allowed_origins', ["*"]),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize OpenAI client
openai.api_key = config.get('openai_api_key')

# Initialize cache
cache = Cache()

# Initialize service
refinement_service = TextRefinementService(logger)

@app.get("/health")
async def health_check():
    return APIResponse(message="AI Refinement Service is healthy")

@app.post("/refine", response_model=TextRefinementResponse)
async def refine_text(request: TextRefinementRequest):
    try:
        return await refinement_service.refine_text(request)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Refinement error: {str(e)}")
        return ErrorResponse(message="Refinement failed", error=str(e))

@app.get("/refinement-types")
async def get_refinement_types():
    steps = refinement_config.get_all_refinement_steps()
    return APIResponse(data={
        "types": [
            {"id": k, "name": v["name"], "description": v["description"]}
            for k, v in steps.items() if v.get("enabled", True)
        ]
    })

@app.post("/batch-refine")
async def batch_refine_text(requests: List[TextRefinementRequest]):
    try:
        results = []
        for req in requests:
            result = await refinement_service.refine_text(req)
            results.append(result)
        return results
    except Exception as e:
        logger.error(f"Batch refinement error: {str(e)}")
        return ErrorResponse(message="Batch refinement failed", error=str(e))

if __name__ == "__main__":
    try:
        import uvicorn
    except ImportError:
        raise RuntimeError("uvicorn must be installed to run this service.")
    uvicorn.run(app, host="0.0.0.0", port=8000)
