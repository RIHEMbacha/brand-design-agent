# Brand Design Agent
try it : https://container-app-81c1.salmonpebble-6f51f89d.swedencentral.azurecontainerapps.io/

A FastAPI + LangChain agentic system that turns project-specific brand documents into reusable design knowledge and generated UI artifacts.

## Architecture

```text
                    ┌───────────────┐
                    │ Angular (next)│
                    └───────┬───────┘
                            │ HTTP
                            ▼
                    ┌───────────────┐
                    │    FastAPI    │
                    └───────┬───────┘
                            │
                    ┌───────▼────────┐
                    │   LangChain    │
                    │     Agent      │
                    └───┬────────┬───┘
                        │        │
              ┌─────────┘        └─────────────┐
              ▼                                ▼
        ┌───────────┐                    ┌──────────┐
        │  Qdrant   │                    │ Supabase │
        │   RAG     │                    │ Postgres │
        └───────────┘                    │ + Storage│
                                         └──────────┘

        Local development                Production
        ─────────────────                ──────────
        Hugging Face Router              vLLM
        HF token                         GPU
        OpenAI-compatible API            OpenAI-compatible API
```

The application deliberately keeps the canonical design tokens in PostgreSQL and the searchable brand knowledge in Qdrant. Supabase Storage holds the original uploads and generated ZIPs.

## Local vs production LLM

### Local development

```env
LLM_PROVIDER=huggingface
HF_BASE_URL=https://router.huggingface.co/v1
HF_TOKEN=...
LLM_MODEL=Qwen/Qwen3-VL-8B-Instruct
```

Hugging Face's router exposes an OpenAI-compatible API.

### Production

```env
LLM_PROVIDER=vllm
VLLM_BASE_URL=http://vllm:8000/v1
VLLM_API_KEY=...
LLM_MODEL=Qwen/Qwen3-VL-8B-Instruct
```

The FastAPI/LangChain code does not change.

## What this version implements

1. Project creation.
2. TXT/MD/JSON ingestion.
3. PDF text extraction with PyMuPDF.
4. Scanned PDF fallback using vision analysis for pages with little/no text.
5. PNG/JPG/WEBP image analysis through the configured vision-capable LLM.
6. Design-token extraction into structured Pydantic data.
7. Persistence of design tokens in Supabase PostgreSQL.
8. Chunking + local FastEmbed embeddings.
9. Project-filtered Qdrant RAG.
10. LangChain agent with tools:
   - `get_design_tokens`
   - `search_brand_knowledge`
   - `list_brand_assets`
11. Structured artifact generation for:
   - HTML/CSS
   - Angular
   - Android XML
   - Flyer HTML
12. Basic deterministic safety/format validation.
13. Generated ZIP upload to Supabase Storage.
14. API endpoints for projects, documents, search, tokens and generation.
