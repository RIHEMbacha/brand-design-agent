# Production vLLM

This directory contains a reference deployment for the production LLM service.

Run vLLM separately from FastAPI:

```text
FastAPI/LangChain
       |
       | HTTP /v1
       v
     vLLM
       |
       v
Qwen3-VL-8B-Instruct
```

The application switches to this provider with:

```env
LLM_PROVIDER=vllm
VLLM_BASE_URL=http://vllm:8000/v1
VLLM_API_KEY=...
LLM_MODEL=Qwen/Qwen3-VL-8B-Instruct
```

The compose file requires an NVIDIA GPU and NVIDIA Container Toolkit on the host.
In a managed production environment such as Azure, adapt the same container command
to the GPU workload service you choose.

Do not publish the vLLM port directly to the public internet. Put it behind an
internal network, authenticated gateway, or equivalent network boundary.
