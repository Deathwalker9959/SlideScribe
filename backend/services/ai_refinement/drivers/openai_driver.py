"""OpenAI driver for AI refinement using AsyncOpenAI."""

from __future__ import annotations

from typing import Any

from shared.azure_openai_client import create_openai_client

from .base import AIRefinementDriver


class OpenAIRefinementDriver(AIRefinementDriver):
    """Direct OpenAI implementation using AsyncOpenAI client."""

    def __init__(self):
        """Initialize OpenAI client."""
        # Use shared builder to create client (eliminates duplication)
        self.client = create_openai_client(async_client=True)

    async def refine(self, text: str, step_config: dict[str, Any], **kwargs: Any) -> str:
        """Refine text using OpenAI."""
        model = step_config.get("model", "gpt-4")
        system_prompt = step_config.get(
            "system_prompt",
            (
                "Follow all constraints: keep the exact line order and count (no reordering, merging, splitting, or removals). "
                "Do not add content or ideas. Maintain meaning and natural spoken style; no bullets or new formatting. "
                "Optimize for smooth, clear narration; avoid tongue-twisters; keep sentences manageable while staying on the same lines. "
                "Rephrase only within each line; do not combine concepts across lines. Outputs must be deterministic and non-creative, "
                "with standardized phrasing. Keep length per line close to the original (≤120% unless required). "
                "Return only the final text—no explanations, markdown, or lists. Task: polish slide narration text accordingly."
            ),
        )
        temperature = step_config.get("temperature", 0.3)
        max_tokens = step_config.get("max_tokens", 2000)

        response = await self.client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": text},
            ],
            temperature=temperature,
            max_tokens=max_tokens,
        )

        content = response.choices[0].message.content
        if content is not None:
            return content.strip()
        return ""
