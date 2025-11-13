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
        system_prompt = step_config.get("system_prompt", "Refine this text.")
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
