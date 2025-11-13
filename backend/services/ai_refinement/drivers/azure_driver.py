"""Azure OpenAI driver for AI refinement using v1 API pattern."""

from __future__ import annotations

from typing import Any

from shared.azure_openai_client import create_azure_openai_client, get_azure_deployment_name

from .base import AIRefinementDriver


class AzureOpenAIRefinementDriver(AIRefinementDriver):
    """Azure OpenAI implementation following Microsoft's v1 API pattern."""

    def __init__(self):
        """Initialize Azure OpenAI client with v1 API endpoint."""
        # Use shared builder to create client (eliminates duplication)
        self.client = create_azure_openai_client(async_client=True)

    async def refine(self, text: str, step_config: dict[str, Any], **kwargs: Any) -> str:
        """Refine text using Azure OpenAI with deployment name."""
        # For Azure, use deployment name instead of model name
        deployment = get_azure_deployment_name(step_config.get("model"))
        system_prompt = step_config.get("system_prompt", "Refine this text.")
        temperature = step_config.get("temperature", 0.3)
        max_tokens = step_config.get("max_tokens", 2000)

        response = await self.client.chat.completions.create(
            model=deployment,  # Deployment name for Azure
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
