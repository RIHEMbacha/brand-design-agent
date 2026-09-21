from __future__ import annotations

from functools import lru_cache
from uuid import uuid4

from langchain_core.documents import Document
from langchain_huggingface import HuggingFaceEndpointEmbeddings
from langchain_qdrant import QdrantVectorStore
from qdrant_client import QdrantClient
from qdrant_client.http import models

from app.config import settings


@lru_cache
def get_qdrant_client() -> QdrantClient:
    return QdrantClient(
        url=settings.qdrant_url,
        api_key=settings.qdrant_api_key,
    )


@lru_cache
def get_embeddings() -> HuggingFaceEndpointEmbeddings:
    if not settings.llm_api_key:
        raise RuntimeError(
            "HF_TOKEN is required for Hugging Face embeddings."
        )

    return HuggingFaceEndpointEmbeddings(
        model=settings.embedding_model,
        huggingfacehub_api_token=settings.llm_api_key,
    )


def _ensure_collection() -> None:
    client = get_qdrant_client()

    collections = client.get_collections().collections
    names = {item.name for item in collections}

    if settings.qdrant_collection not in names:
        client.create_collection(
            collection_name=settings.qdrant_collection,
            vectors_config=models.VectorParams(
                size=settings.qdrant_vector_size,
                distance=models.Distance.COSINE,
            ),
        )

    client.create_payload_index(
        collection_name=settings.qdrant_collection,
        field_name="metadata.project_id",
        field_schema=models.PayloadSchemaType.KEYWORD,
    )


@lru_cache
def get_vector_store() -> QdrantVectorStore:
    _ensure_collection()

    return QdrantVectorStore(
        client=get_qdrant_client(),
        collection_name=settings.qdrant_collection,
        embedding=get_embeddings(),
    )


def add_documents(
        documents: list[Document],
        *,
        project_id: str,
) -> int:
    if not documents:
        return 0

    for document in documents:
        document.metadata["project_id"] = project_id

    ids = [str(uuid4()) for _ in documents]

    get_vector_store().add_documents(
        documents=documents,
        ids=ids,
    )

    return len(documents)


def search_documents(
        *,
        project_id: str,
        query: str,
        top_k: int | None = None,
) -> list[tuple[Document, float]]:
    _ensure_collection()

    return get_vector_store().similarity_search_with_score(
        query=query,
        k=top_k or settings.qdrant_top_k,
        filter=models.Filter(
            must=[
                models.FieldCondition(
                    key="metadata.project_id",
                    match=models.MatchValue(value=project_id),
                )
            ]
        ),
    )