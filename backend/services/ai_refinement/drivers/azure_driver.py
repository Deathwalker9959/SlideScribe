from .base import AIRefinementDriver
from typing import Any, Dict
import os
import aiohttp

class AzureOpenAIRefinementDriver(AIRefinementDriver):
    async def refine(self, text: str, step_config: Dict[str, Any], **kwargs: Any) -> str:
        api_key = os.getenv("AZURE_OPENAI_KEY")
        endpoint = os.getenv("AZURE_OPENAI_ENDPOINT")
        deployment = step_config.get("model", "gpt-35-turbo")
        api_version = step_config.get("api_version", "2023-12-01-preview")
        system_prompt = step_config.get("system_prompt", "Refine this text.")
        temperature = step_config.get("temperature", 0.3)
        max_tokens = step_config.get("max_tokens", 2000)
        url = f"{endpoint}/openai/deployments/{deployment}/chat/completions?api-version={api_version}"
        headers: Dict[str, str] = {
            "api-key": str(api_key),
            "Content-Type": "application/json"
        }
        payload: Dict[str, Any] = {
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": text}
            ],
            "temperature": temperature,
            "max_tokens": max_tokens
        }
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload, headers=headers) as resp:
                data = await resp.json()
                return data["choices"][0]["message"]["content"].strip()
