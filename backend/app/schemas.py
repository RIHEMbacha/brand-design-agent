from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


ArtifactType = Literal[
    "html",
    "angular",
    "android_xml",
    "flyer_html",
]


class GenerationRequest(BaseModel):
    artifact_type: ArtifactType
    prompt: str = Field(
        min_length=1,
        max_length=5000,
    )
    name: str | None = Field(default=None, min_length=1, max_length=120)

    @field_validator("artifact_type", mode="before")
    @classmethod
    def normalize_artifact_type(cls, value: str) -> str:
        value = value.strip().lower()

        aliases = {
            "html/css": "html",
            "html_tailwind": "html",
            "html + css": "html",
            "android": "android_xml",
            "xml": "android_xml",
            "flyer": "flyer_html",
        }

        return aliases.get(value, value)


class GeneratedFile(BaseModel):
    path: str = Field(min_length=1)
    language: str = Field(min_length=1)
    content: str

    @field_validator("path")
    @classmethod
    def validate_path(cls, value: str) -> str:
        value = value.strip()

        if not value:
            raise ValueError("Generated file path cannot be empty.")

        if value.startswith("/"):
            raise ValueError("Generated file path must be relative.")

        if ".." in value.split("/"):
            raise ValueError("Generated file path cannot contain '..'.")

        return value

    @field_validator("content", mode="before")
    @classmethod
    def normalize_content(cls, value: Any) -> str:
        if value is None:
            return ""

        if isinstance(value, str):
            return value

        return str(value)


class AppliedToken(BaseModel):
    name: str
    value: str



class GeneratedUIOutput(BaseModel):
    artifact_type: str
    title: str
    files: list[GeneratedFile]
    applied_tokens: list[AppliedToken] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)



class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=1000)


class ProjectResponse(BaseModel):
    id: str
    name: str
    description: str | None = None
    created_at: str | None = None


class DocumentResponse(BaseModel):
    id: str
    project_id: str
    filename: str
    mime_type: str
    storage_path: str
    status: str
    size_bytes: int
    error_message: str | None = None
    created_at: str | None = None


class BrandInfo(BaseModel):
    name: str | None = None
    tone: list[str] = Field(default_factory=list)
    visual_style: list[str] = Field(default_factory=list)


class DesignTokensPayload(BaseModel):
    brand: BrandInfo = Field(default_factory=BrandInfo)
    colors: dict[str, str] = Field(default_factory=dict)
    typography: dict[str, Any] = Field(default_factory=dict)
    spacing: dict[str, str] = Field(default_factory=dict)
    radius: dict[str, str] = Field(default_factory=dict)
    shadows: dict[str, str] = Field(default_factory=dict)
    components: dict[str, Any] = Field(default_factory=dict)
    layout: dict[str, Any] = Field(default_factory=dict)
    imagery: dict[str, Any] = Field(default_factory=dict)
    rules: list[str] = Field(default_factory=list)
    prohibited_patterns: list[str] = Field(default_factory=list)


class DesignTokensResponse(BaseModel):
    project_id: str
    version: int
    tokens: DesignTokensPayload


class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=1000)
    top_k: int = Field(default=6, ge=1, le=20)


class SearchResult(BaseModel):
    content: str
    score: float | None = None
    source: str | None = None
    page: int | None = None
    document_id: str | None = None


class SearchResponse(BaseModel):
    project_id: str
    query: str
    results: list[SearchResult]


class GeneratedArtifactResponse(BaseModel):
    artifact_id: str
    project_id: str
    artifact_type: str
    output: GeneratedUIOutput


class GeneratedArtifactRecord(BaseModel):
    id: str
    project_id: str
    artifact_type: str
    prompt: str
    output: GeneratedUIOutput
    created_at: str | None = None


class LLMTestRequest(BaseModel):
    prompt: str = Field(default="Explain what a design token is in one sentence.", max_length=2000)

class LLMStructuredTest(BaseModel):
    message: str
    number: int


class SignupRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=8, max_length=128)
    name: str | None = Field(default=None, max_length=120)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        value = value.strip().lower()
        if "@" not in value or value.startswith("@") or value.endswith("@"):
            raise ValueError("A valid email address is required.")
        return value


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.strip().lower()


class UserResponse(BaseModel):
    id: str
    email: str
    name: str | None = None
    created_at: str | None = None


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse