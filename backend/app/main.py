from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.schemas import LLMTestRequest, LLMStructuredTest,GeneratedUIOutput
from app.api import auth, documents, generation, projects, search, tokens
from app.auth import get_current_user
from app.llm import get_llm


logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
)

app = FastAPI(
    title="Brand Design Agent",
    version="0.1.0",
    description="Project-scoped agentic design system and UI generation API.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:4200",
        "http://127.0.0.1:4200",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(projects.router, dependencies=[Depends(get_current_user)])
app.include_router(documents.router, dependencies=[Depends(get_current_user)])
app.include_router(search.router, dependencies=[Depends(get_current_user)])
app.include_router(tokens.router, dependencies=[Depends(get_current_user)])
app.include_router(generation.router, dependencies=[Depends(get_current_user)])


@app.get("/health")
def health():
    return {
        "status": "ok",
        "environment": settings.app_env,
        "model": settings.llm_model,
    }

@app.post("/api/llm-test-artifact", dependencies=[Depends(get_current_user)])
def llm_test_artifact():
    llm = get_llm()

    structured = llm.with_structured_output(
        GeneratedUIOutput,
        method="function_calling",
    )

    prompt = """
Create a simple HTML landing page for a fictional coffee shop.

Return:
- one HTML file
- complete usable HTML
- no external secrets
- title: Coffee Shop Landing Page
"""

    try:
        response = structured.invoke(prompt)

        return {
            "success": response is not None,
            "response_type": (
                type(response).__name__
                if response is not None
                else "NoneType"
            ),
            "response": (
                response.model_dump()
                if response is not None
                else None
            ),
        }

    except Exception as exc:
        import traceback

        return {
            "success": False,
            "error": str(exc),
            "error_type": type(exc).__name__,
            "traceback": traceback.format_exc(),
        }

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=settings.app_env == "development",
    )
