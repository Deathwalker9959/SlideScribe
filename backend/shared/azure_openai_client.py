"""Builder for creating Azure OpenAI and OpenAI clients.

This module provides factory functions to create properly configured OpenAI clients,
eliminating duplication across driver implementations.
"""

from __future__ import annotations

import os

from openai import AsyncOpenAI, OpenAI

from shared.utils import config


def create_azure_openai_client(
    api_key: str | None = None,
    azure_endpoint: str | None = None,
    async_client: bool = True,
) -> AsyncOpenAI | OpenAI:
    """
    Create an Azure OpenAI client using v1 API pattern.

    Args:
        api_key: Azure OpenAI API key (auto-detected if None)
        azure_endpoint: Azure OpenAI endpoint URL (auto-detected if None)
        async_client: Whether to return AsyncOpenAI (True) or sync OpenAI (False)

    Returns:
        Configured AsyncOpenAI or OpenAI client

    Raises:
        ValueError: If credentials are not configured
    """
    api_key = api_key or config.get("azure_openai_key") or os.getenv("AZURE_OPENAI_KEY")
    azure_endpoint = (
        azure_endpoint or config.get("azure_openai_endpoint") or os.getenv("AZURE_OPENAI_ENDPOINT")
    )

    if not api_key or not azure_endpoint:
        raise ValueError(
            "Azure OpenAI credentials not configured. "
            "Set AZURE_OPENAI_KEY and AZURE_OPENAI_ENDPOINT environment variables."
        )

    # Use OpenAI v1 SDK with Azure AI Foundry / Azure OpenAI Service
    # Following official Azure OpenAI Python SDK pattern
    # https://learn.microsoft.com/en-us/azure/ai-services/openai/
    base_url = f"{azure_endpoint}/openai/v1/"  # v1 API pattern

    if async_client:
        return AsyncOpenAI(api_key=api_key, base_url=base_url)
    return OpenAI(api_key=api_key, base_url=base_url)


def create_openai_client(
    api_key: str | None = None,
    async_client: bool = True,
) -> AsyncOpenAI | OpenAI:
    """
    Create a direct OpenAI client.

    Args:
        api_key: OpenAI API key (auto-detected if None)
        async_client: Whether to return AsyncOpenAI (True) or sync OpenAI (False)

    Returns:
        Configured AsyncOpenAI or OpenAI client

    Raises:
        ValueError: If API key is not configured
    """
    api_key = api_key or config.get("openai_api_key") or os.getenv("OPENAI_API_KEY")

    if not api_key:
        raise ValueError("OpenAI API key not configured. Set OPENAI_API_KEY environment variable.")

    if async_client:
        return AsyncOpenAI(api_key=api_key)
    return OpenAI(api_key=api_key)


def get_azure_deployment_name(deployment: str | None = None) -> str:
    """
    Get Azure OpenAI deployment name from config or parameter.

    Args:
        deployment: Explicit deployment name (overrides config)

    Returns:
        Azure deployment name
    """
    return (
        deployment
        or config.get("azure_openai_deployment")
        or os.getenv("AZURE_OPENAI_DEPLOYMENT")
        or "gpt-4"
    )
