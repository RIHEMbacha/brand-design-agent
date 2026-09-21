# Brand Design Agent

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

## Important security rule

Keep `SUPABASE_SERVICE_KEY`, `HF_TOKEN`, `VLLM_API_KEY` and `QDRANT_API_KEY` on the backend only. Never put them in Angular.

Use a private Supabase Storage bucket for brand documents and generated artifacts. Supabase supports private buckets and time-limited signed URLs.

## 1. Create a virtual environment

### Windows PowerShell

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### WSL/Linux

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## 2. Configure environment

Copy:

```text
.env.example -> .env
```

Set:

```env
LLM_PROVIDER=huggingface
HF_TOKEN=your_token
LLM_MODEL=Qwen/Qwen3-VL-8B-Instruct

QDRANT_URL=https://YOUR-CLUSTER.qdrant.io
QDRANT_API_KEY=your_qdrant_key

SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_SERVICE_KEY=your_service_role_key
```

For production change only the LLM provider settings:

```env
LLM_PROVIDER=vllm
VLLM_BASE_URL=http://vllm:8000/v1
VLLM_API_KEY=your_internal_vllm_key
LLM_MODEL=Qwen/Qwen3-VL-8B-Instruct
```

## 3. Create the Supabase database schema

Run:

```text
supabase/schema.sql
```

in the Supabase SQL editor.

Then create two private Storage buckets:

```text
brand-files
generated-artifacts
```

The backend expects those names by default.

## 4. Start the API

From `backend/`:

```bash
uvicorn app.main:app --reload
```

Open:

```text
http://127.0.0.1:8000/docs
```

## 5. Test the LLM

```bash
curl http://127.0.0.1:8000/api/llm-test \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Explain what a design token is in one sentence."}'
```

## 6. Create a project

```bash
curl http://127.0.0.1:8000/api/projects \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"name":"Demo Brand","description":"Demo design system"}'
```

Use the returned project ID.

## 7. Upload a brand document

```bash
curl http://127.0.0.1:8000/api/projects/PROJECT_ID/documents \
  -X POST \
  -F "file=@./brand-guide.pdf"
```

The API:

```text
upload
 -> Supabase Storage
 -> parse
 -> extract design tokens
 -> save design tokens in Postgres
 -> chunk
 -> embed
 -> index in Qdrant
```

## 8. Search the project knowledge

```bash
curl http://127.0.0.1:8000/api/projects/PROJECT_ID/search \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"query":"What are the button rules?","top_k":5}'
```

## 9. Generate UI

```bash
curl http://127.0.0.1:8000/api/projects/PROJECT_ID/generate \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "artifact_type":"html",
    "prompt":"Create a responsive landing page with a hero, three feature cards and a call-to-action."
  }'
```

The generation flow is:

```text
user request
    ↓
LangChain agent
    ↓
get_design_tokens
    ↓
search_brand_knowledge
    ↓
list_brand_assets (when relevant)
    ↓
design context
    ↓
structured artifact generator
    ↓
validation
    ↓
Supabase generated ZIP
```

## Production vLLM

Deploy vLLM separately from FastAPI. FastAPI should call vLLM over HTTP.
The reference manifest is in `infrastructure/vllm/`. Keeping vLLM separate means
the API tier can scale independently from GPU inference.

Example:

```bash
vllm serve Qwen/Qwen3-VL-8B-Instruct \
  --host 0.0.0.0 \
  --port 8000 \
  --api-key YOUR_SECRET \
  --max-model-len 8192
```

Then:

```env
LLM_PROVIDER=vllm
VLLM_BASE_URL=http://vllm:8000/v1
VLLM_API_KEY=YOUR_SECRET
LLM_MODEL=Qwen/Qwen3-VL-8B-Instruct
```

Do not expose the vLLM port publicly without an authentication/network boundary.

## Next frontend phase

The backend is intentionally ready for an Angular frontend with these screens:

```text
Projects
  -> Documents
  -> Design System
  -> Generator
  -> Preview / Code
  -> Generated Artifacts
```

Do not move secrets to Angular.

## Sources / official references

- LangChain agents: https://reference.langchain.com/python/langchain/agents/factory/create_agent
- LangChain Qdrant integration: https://reference.langchain.com/python/langchain-qdrant/qdrant/QdrantVectorStore
- Hugging Face OpenAI-compatible API: https://huggingface.co/docs/inference-providers/index
- vLLM OpenAI-compatible serving: https://docs.vllm.ai/en/latest/serving/online_serving/openai_compatible_server/
- Supabase Storage Python: https://supabase.com/docs/reference/python/storage-from-upload
