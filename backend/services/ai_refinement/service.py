import json
import time

from fastapi import HTTPException
from openai import AsyncOpenAI

from services.ai_refinement.config.config_loader import config as refinement_config
from services.ai_refinement.contextual_refiner import ContextualRefiner
from shared.models import (
    ContextualRefinementRequest,
    RefinedScript,
    TextRefinementRequest,
    TextRefinementResponse,
)
from shared.utils import Cache, config, generate_hash, validate_text_length


def calculate_flesch_reading_ease(text: str) -> float:
    """
    Calculate Flesch Reading Ease score.
    Score interpretation:
    90-100: Very Easy
    80-89: Easy
    70-79: Fairly Easy
    60-69: Standard
    50-59: Fairly Difficult
    30-49: Difficult
    0-29: Very Confusing
    """
    if not text or not text.strip():
        return 0.0

    sentences = text.count(".") + text.count("!") + text.count("?")
    if sentences == 0:
        sentences = 1

    words = len(text.split())
    if words == 0:
        return 0.0

    syllables = sum(_count_syllables(word) for word in text.split())

    # Flesch Reading Ease formula
    score = 206.835 - 1.015 * (words / sentences) - 84.6 * (syllables / words)
    return max(0.0, min(100.0, score))


def _count_syllables(word: str) -> int:
    """Count syllables in a word using a simple heuristic."""
    word = word.lower().strip(".,!?;:")
    if not word:
        return 0

    vowels = "aeiouy"
    syllable_count = 0
    previous_was_vowel = False

    for char in word:
        is_vowel = char in vowels
        if is_vowel and not previous_was_vowel:
            syllable_count += 1
        previous_was_vowel = is_vowel

    # Adjust for silent e
    if word.endswith("e"):
        syllable_count -= 1

    # Every word has at least one syllable
    return max(1, syllable_count)


class TextRefinementService:
    """Service for AI-powered text refinement using YAML configuration"""

    def __init__(self, logger):
        self.logger = logger
        self.cache = Cache()
        if not refinement_config.validate_config():
            raise ValueError("Invalid refinement configuration")
        self.logger.info(
            f"Loaded {len(refinement_config.get_enabled_steps())} enabled refinement steps"
        )
        self.contextual_refiner = ContextualRefiner(logger)

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
            quality_metrics = refinement_config.get_quality_metrics()
            min_improvement_score = quality_metrics.get("min_improvement_score", 0.1)

            # If improvement is below threshold, return original text with low confidence
            if improvement_score < min_improvement_score and text != refined_text:
                self.logger.info(
                    f"Improvement score {improvement_score:.2f} below threshold "
                    f"{min_improvement_score:.2f}, returning original text"
                )
                refined_text = text
                changes_made = []
                improvement_score = 0.0

            response = TextRefinementResponse(
                original_text=text,
                refined_text=refined_text,
                suggestions=changes_made,
                confidence_score=improvement_score,
                processing_time=time.time() - start_time,
            )
            self.cache.set(cache_key, response)
            return response
        except Exception as e:
            self.logger.error(f"Error in text refinement: {e!s}")
            raise HTTPException(status_code=500, detail=f"Text refinement failed: {e!s}") from e

    async def refine_with_context(self, request: ContextualRefinementRequest) -> RefinedScript:
        """Refine slide text while incorporating contextual metadata."""
        try:
            payload = json.dumps(request.model_dump(mode="json"), sort_keys=True)
            cache_key = generate_hash(f"context::{payload}")
            cached_result = self.cache.get(cache_key)
            if cached_result:
                return cached_result

            result = await self.contextual_refiner.refine(request)
            self.cache.set(cache_key, result)
            return result
        except Exception as exc:
            self.logger.error("Contextual refinement failed: %s", exc)
            raise HTTPException(
                status_code=500,
                detail=f"Contextual refinement failed: {exc!s}",
            ) from exc

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

    async def _call_ai_model(
        self, system_prompt: str, user_text: str, temperature: float = 0.3, max_tokens: int = 2000
    ) -> str:
        try:
            model_config = refinement_config.get_ai_model_config("primary")
            api_key = config.get("openai_api_key")
            if not api_key:
                self.logger.warning(
                    "OpenAI API key not configured; returning original text for offline mode"
                )
                return user_text

            client = AsyncOpenAI(api_key=api_key)
            response = await client.chat.completions.create(
                model=model_config.get("model", "gpt-4"),
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_text},
                ],
                temperature=temperature,
                max_tokens=max_tokens,
            )
            return response.choices[0].message.content
        except Exception as e:
            self.logger.error(f"AI model call failed: {e!s}")
            raise e

    def _calculate_improvement_score(self, original: str, refined: str) -> float:
        """
        Calculate improvement score based on quality metrics.
        Returns a score between 0.0 and 1.0.
        """
        if original == refined:
            return 0.0

        improvements = 0
        total_checks = 0

        quality_metrics = refinement_config.get_quality_metrics()
        max_length_increase = quality_metrics.get("max_length_increase", 1.2)
        min_readability_score = quality_metrics.get("min_readability_score", 60)

        # Check 1: Length increase is within acceptable range
        length_ratio = len(refined) / len(original) if original else 1.0
        if length_ratio <= max_length_increase:
            improvements += 1
        total_checks += 1

        # Check 2: Word count didn't increase significantly
        original_words = len(original.split())
        refined_words = len(refined.split())
        word_ratio = refined_words / original_words if original_words > 0 else 1.0
        if word_ratio <= max_length_increase:
            improvements += 1
        total_checks += 1

        # Check 3: Sentence structure maintained or improved
        original_sentences = original.count(".") + original.count("!") + original.count("?")
        refined_sentences = refined.count(".") + refined.count("!") + refined.count("?")
        if original_sentences == 0:
            original_sentences = 1
        if refined_sentences >= original_sentences * 0.8:
            improvements += 1
        total_checks += 1

        # Check 4: Readability score meets minimum threshold
        readability_score = calculate_flesch_reading_ease(refined)
        if readability_score >= min_readability_score:
            improvements += 1
        total_checks += 1

        # Check 5: Readability improved or maintained
        original_readability = calculate_flesch_reading_ease(original)
        if readability_score >= original_readability * 0.95:
            improvements += 1
        total_checks += 1

        final_score = improvements / total_checks if total_checks > 0 else 0.5

        # Log quality metrics for debugging
        self.logger.debug(
            f"Quality metrics - Length ratio: {length_ratio:.2f}, "
            f"Word ratio: {word_ratio:.2f}, "
            f"Readability: {readability_score:.1f} (orig: {original_readability:.1f}), "
            f"Score: {final_score:.2f}"
        )

        return final_score
