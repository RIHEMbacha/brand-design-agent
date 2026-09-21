from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = "development"
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    log_level: str = "INFO"

    # LLM
    llm_base_url: str
    llm_api_key: str
    llm_model: str
    azure_llm_base_url: str = ""
    azure_llm_api_key: str = ""
    azure_llm_model: str = ""
    azure_llm_temperature: float = 0.2
    azure_llm_max_tokens: int = 8000

    llm_temperature: float = 0.0
    llm_max_tokens: int = 4096

    # Qdrant
    qdrant_url: str
    qdrant_api_key: str
    qdrant_collection: str = "brand_knowledge"
    qdrant_vector_size: int = 384
    embedding_model: str = "BAAI/bge-small-en-v1.5"
    qdrant_top_k: int = Field(default=6, ge=1, le=20)

    # Supabase
    supabase_url: str
    supabase_service_key: str
    supabase_brand_bucket: str = "brand-files"
    supabase_artifact_bucket: str = "generated-artifacts"

    # Authentication
    jwt_secret: str = "change-this-secret-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expiration_minutes: int = Field(default=480, ge=5, le=10080)

    # Limits
    max_upload_mb: int = Field(default=20, ge=1, le=200)
    max_scanned_pdf_pages: int = Field(default=8, ge=1, le=30)
    max_chunk_size: int = Field(default=800, ge=200, le=4000)
    chunk_overlap: int = Field(default=120, ge=0, le=500)
    signed_url_ttl_seconds: int = Field(default=900, ge=60, le=86400)

    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="",
        case_sensitive=False,
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
