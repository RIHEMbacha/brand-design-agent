from functools import lru_cache

from langchain_openai import ChatOpenAI

from app.config import settings


@lru_cache
def get_llm() -> ChatOpenAI:
    if not settings.azure_llm_base_url:
        raise RuntimeError("AZURE_LLM_BASE_URL is required.")

    if not settings.azure_llm_api_key:
        raise RuntimeError("AZURE_LLM_API_KEY is required.")

    if not settings.azure_llm_model:
        raise RuntimeError("AZURE_LLM_MODEL is required.")

    return ChatOpenAI(
        model=settings.azure_llm_model,
        api_key=settings.azure_llm_api_key,
        base_url=settings.azure_llm_base_url,
        temperature=settings.azure_llm_temperature,
        max_tokens=settings.azure_llm_max_tokens,
    )