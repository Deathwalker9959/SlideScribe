from typing import Any

import openai

from shared.utils import config

from .base import AIRefinementDriver


class OpenAIRefinementDriver(AIRefinementDriver):
    async def refine(self, text: str, step_config: dict[str, Any], **kwargs: Any) -> str:
        api_key = config.get("openai_api_key")
        model = step_config.get("model", "gpt-4")
        system_prompt = step_config.get("system_prompt", "Refine this text.")
        temperature = step_config.get("temperature", 0.3)
        max_tokens = step_config.get("max_tokens", 2000)
        client = openai.OpenAI(api_key=api_key)
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": text},
            ],
            temperature=temperature,
            max_tokens=max_tokens,
        )
        content = getattr(response.choices[0].message, "content", None)
        if content is not None:
            return content.strip()
        return ""
