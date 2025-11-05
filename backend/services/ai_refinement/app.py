import openai
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from services.ai_refinement.config.config_loader import config as refinement_config
from services.ai_refinement.service import TextRefinementService
from services.auth import oauth2_scheme
from shared.models import APIResponse, ErrorResponse, TextRefinementRequest, TextRefinementResponse
from shared.utils import Cache, config, setup_logging

logger = setup_logging("ai-refinement-service")

app = FastAPI(
    title="AI Text Refinement Service",
    description="Intelligent text refinement for PowerPoint presentations",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.get("allowed_origins", ["*"]),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

openai.api_key = config.get("openai_api_key")

cache = Cache()

refinement_service = TextRefinementService(logger)


@app.get("/health")
async def health_check():
    return APIResponse(message="AI Refinement Service is healthy")


@app.post("/refine", response_model=TextRefinementResponse)
async def refine_text(request: TextRefinementRequest, token: str = Depends(oauth2_scheme)):
    try:
        return await refinement_service.refine_text(request)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Refinement error: {e!s}")
        return ErrorResponse(message="Refinement failed", error=str(e))


@app.get("/refinement-types")
async def get_refinement_types(token: str = Depends(oauth2_scheme)):
    steps = refinement_config.get_all_refinement_steps()
    return APIResponse(
        data={
            "types": [
                {"id": k, "name": v["name"], "description": v["description"]}
                for k, v in steps.items()
                if v.get("enabled", True)
            ]
        }
    )


@app.post("/batch-refine")
async def batch_refine_text(
    requests: list[TextRefinementRequest], token: str = Depends(oauth2_scheme)
):
    try:
        results = []
        for req in requests:
            result = await refinement_service.refine_text(req)
            results.append(result)
        return results
    except Exception as e:
        logger.error(f"Batch refinement error: {e!s}")
        return ErrorResponse(message="Batch refinement failed", error=str(e))


if __name__ == "__main__":
    try:
        import uvicorn
    except ImportError as e:
        raise RuntimeError("uvicorn must be installed to run this service.") from e
    uvicorn.run(app, host="0.0.0.0", port=8000)
