"""FastAPI application for SSML builder service."""

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from services.auth import oauth2_scheme
from services.ssml_builder.builder import SSMLBuilder
from services.ssml_builder.lexicon_manager import LexiconManager
from shared.models import (
    PronunciationLexicon,
    PronunciationLexiconRequest,
    SSMLRequest,
    SSMLResponse,
)
from shared.utils import config, setup_logging

logger = setup_logging("ssml-service")

app = FastAPI(
    title="SSML Builder Service",
    description="Generate SSML markup and manage pronunciation lexicons",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.get("allowed_origins", ["*"]),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize services
lexicon_manager = LexiconManager()
app.state.lexicon_manager = lexicon_manager


def get_lexicon_manager() -> LexiconManager:
    return app.state.lexicon_manager


@app.get("/health")
async def health_check():
    """Health endpoint for SSML builder service."""
    return {"status": "ok", "service": "ssml-builder"}


@app.post("/generate", response_model=SSMLResponse)
async def generate_ssml(
    request: SSMLRequest,
    token: str = Depends(oauth2_scheme),
    manager: LexiconManager = Depends(get_lexicon_manager),
) -> SSMLResponse:
    """
    Generate SSML markup from text with optional pronunciation lexicon.

    The lexicon will be automatically looked up based on lexicon_id in the request.
    """
    try:
        # Create SSML builder
        builder = SSMLBuilder(language=request.text[:5] if len(request.text) >= 5 else "en-US")

        # Get lexicon if specified
        lexicon = None
        if request.pronunciation_lexicon_id:
            lexicon = manager.get_lexicon(request.pronunciation_lexicon_id)
            if not lexicon:
                logger.warning(f"Lexicon {request.pronunciation_lexicon_id} not found")

        # Build SSML
        ssml = builder.build(request, lexicon)

        return SSMLResponse(
            ssml=ssml,
            plain_text=request.text,
            lexicon_applied=lexicon is not None,
        )
    except Exception as e:
        logger.error(f"SSML generation failed: {e}")
        raise HTTPException(status_code=500, detail=f"SSML generation failed: {e!s}") from e


@app.post("/presets/{preset_name}", response_model=SSMLResponse)
async def generate_from_preset(
    preset_name: str,
    text: str,
    token: str = Depends(oauth2_scheme),
) -> SSMLResponse:
    """Generate SSML using a preset configuration."""
    try:
        request = SSMLBuilder.create_preset(preset_name, text)
        builder = SSMLBuilder()
        ssml = builder.build(request, None)

        return SSMLResponse(
            ssml=ssml,
            plain_text=text,
            lexicon_applied=False,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


# Pronunciation Lexicon endpoints

@app.post("/lexicons", response_model=PronunciationLexicon, status_code=201)
async def create_lexicon(
    request: PronunciationLexiconRequest,
    token: str = Depends(oauth2_scheme),
    manager: LexiconManager = Depends(get_lexicon_manager),
) -> PronunciationLexicon:
    """Create a new pronunciation lexicon."""
    try:
        return manager.create_lexicon(request)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.get("/lexicons", response_model=list[PronunciationLexicon])
async def list_lexicons(
    presentation_id: str | None = None,
    owner_id: str | None = None,
    token: str = Depends(oauth2_scheme),
    manager: LexiconManager = Depends(get_lexicon_manager),
) -> list[PronunciationLexicon]:
    """List pronunciation lexicons filtered by presentation_id and/or owner_id."""
    return manager.list_lexicons(presentation_id, owner_id)


@app.get("/lexicons/{lexicon_id}", response_model=PronunciationLexicon)
async def get_lexicon(
    lexicon_id: str,
    token: str = Depends(oauth2_scheme),
    manager: LexiconManager = Depends(get_lexicon_manager),
) -> PronunciationLexicon:
    """Get a specific pronunciation lexicon."""
    lexicon = manager.get_lexicon(lexicon_id)
    if not lexicon:
        raise HTTPException(status_code=404, detail=f"Lexicon {lexicon_id} not found")
    return lexicon


@app.put("/lexicons/{lexicon_id}", response_model=PronunciationLexicon)
async def update_lexicon(
    lexicon_id: str,
    updates: dict,
    token: str = Depends(oauth2_scheme),
    manager: LexiconManager = Depends(get_lexicon_manager),
) -> PronunciationLexicon:
    """Update an existing pronunciation lexicon."""
    try:
        return manager.update_lexicon(lexicon_id, updates)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@app.delete("/lexicons/{lexicon_id}")
async def delete_lexicon(
    lexicon_id: str,
    token: str = Depends(oauth2_scheme),
    manager: LexiconManager = Depends(get_lexicon_manager),
):
    """Delete a pronunciation lexicon."""
    success = manager.delete_lexicon(lexicon_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"Lexicon {lexicon_id} not found")
    return {"success": True, "lexicon_id": lexicon_id}


@app.get("/lexicons/applicable")
async def get_applicable_lexicon(
    presentation_id: str | None = None,
    owner_id: str | None = None,
    token: str = Depends(oauth2_scheme),
    manager: LexiconManager = Depends(get_lexicon_manager),
) -> dict:
    """Get the most specific applicable lexicon for a presentation/owner."""
    lexicon = manager.get_applicable_lexicon(presentation_id, owner_id)
    if lexicon:
        return {"lexicon": lexicon.model_dump(), "found": True}
    return {"lexicon": None, "found": False}
