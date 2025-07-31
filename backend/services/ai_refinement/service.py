import time
import openai
from openai import AsyncOpenAI
from fastapi import HTTPException
from backend.shared.models import TextRefinementRequest, TextRefinementResponse
from backend.shared.utils import generate_hash, validate_text_length, Cache, config
from backend.services.ai_refinement.config.config_loader import config as refinement_config

class TextRefinementService:
    """Service for AI-powered text refinement using YAML configuration"""
    def __init__(self, logger):
        self.logger = logger
        self.cache = Cache()
        if not refinement_config.validate_config():
            raise ValueError("Invalid refinement configuration")
        self.logger.info(f"Loaded {len(refinement_config.get_enabled_steps())} enabled refinement steps")

    async def refine_text(self, request: TextRefinementRequest) -> TextRefinementResponse:
        start_time = time.time()
        try:
            text = self._validate_and_prepare_text(request.text)
            cache_key = self._generate_cache_key(text, request)
            cached_result = self.cache.get(cache_key)
            if cached_result:
                return cached_result

            pipeline_steps = self._get_pipeline_steps(request)
            refined_text, changes_made = await self._run_pipeline(text, pipeline_steps)

            improvement_score = self._calculate_improvement_score(text, refined_text)
            response = TextRefinementResponse(
                original_text=text,
                refined_text=refined_text,
                suggestions=changes_made,
                confidence_score=improvement_score,
                processing_time=time.time() - start_time
            )
            self.cache.set(cache_key, response)
            return response
        except Exception as e:
            self.logger.error(f"Error in text refinement: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Text refinement failed: {str(e)}")

    def _validate_and_prepare_text(self, text: str) -> str:
        return validate_text_length(text)

    def _generate_cache_key(self, text: str, request: TextRefinementRequest) -> str:
        return generate_hash(f"{text}_{request.refinement_type}_{request.tone}")

    def _get_pipeline_steps(self, request: TextRefinementRequest):
        if request.refinement_type == "custom_pipeline" and request.tone:
            return refinement_config.get_pipeline_for_content_type(request.tone)
        return refinement_config.get_default_pipeline()

    async def _run_pipeline(self, text: str, pipeline_steps):
        refined_text = text
        changes_made = []
        for step_name in pipeline_steps:
            step_cfg = refinement_config.get_refinement_step(step_name)
            if not step_cfg or not step_cfg.get("enabled", True):
                continue
            prompt = step_cfg["system_prompt"]
            temperature = step_cfg.get("temperature", 0.3)
            max_tokens = step_cfg.get("max_tokens", 2000)
            ai_result = await self._call_ai_model(prompt, refined_text, temperature, max_tokens)
            if ai_result and ai_result.strip():
                changes_made.append({"step": step_name, "description": step_cfg["description"]})
                refined_text = ai_result.strip()
        return refined_text, changes_made

    async def _call_ai_model(self, system_prompt: str, user_text: str, temperature: float = 0.3, max_tokens: int = 2000) -> str:
        try:
            model_config = refinement_config.get_ai_model_config("primary")
            api_key = config.get('openai_api_key')
            client = AsyncOpenAI(api_key=api_key)
            response = await client.chat.completions.create(
                model=model_config.get("model", "gpt-4"),
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_text}
                ],
                temperature=temperature,
                max_tokens=max_tokens
            )
            return response.choices[0].message.content
        except Exception as e:
            self.logger.error(f"AI model call failed: {str(e)}")
            raise e

    def _calculate_improvement_score(self, original: str, refined: str) -> float:
        if original == refined:
            return 0.0
        improvements = 0
        total_checks = 0
        length_ratio = len(refined) / len(original) if original else 1.0
        quality_metrics = refinement_config.get_quality_metrics()
        max_length_increase = quality_metrics.get("max_length_increase", 1.2)
        if length_ratio <= max_length_increase:
            improvements += 1
        total_checks += 1
        original_words = len(original.split())
        refined_words = len(refined.split())
        if refined_words <= original_words:
            improvements += 1
        total_checks += 1
        original_sentences = original.count('.')
        refined_sentences = refined.count('.')
        if refined_sentences >= original_sentences:
            improvements += 1
        total_checks += 1
        return improvements / total_checks if total_checks > 0 else 0.5
