from __future__ import annotations

import base64
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import fitz
from langchain_core.documents import Document
from langchain_core.messages import HumanMessage
from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.config import settings
from app.design_system.extractor import merge_design_tokens
from app.design_system.extractor import extract_design_tokens_from_text
from app.db import get_design_tokens, update_document, upsert_design_tokens
from app.llm import get_llm
from app.storage.files import download_bytes
from app.vector.store import add_documents


SUPPORTED_TEXT = {
    "text/plain",
    "text/markdown",
    "application/json",
}
SUPPORTED_IMAGES = {
    "image/png",
    "image/jpeg",
    "image/webp",
}


@dataclass
class IngestResult:
    extracted_text: str
    chunks_indexed: int
    token_version: int


def _normalize_text(value: str) -> str:
    return "\n".join(
        line.rstrip()
        for line in value.replace("\x00", "").splitlines()
    ).strip()


def _image_to_data_url(data: bytes, mime_type: str) -> str:
    encoded = base64.b64encode(data).decode("ascii")
    return f"data:{mime_type};base64,{encoded}"


def analyze_image(data: bytes, mime_type: str, filename: str) -> str:
    llm = get_llm()
    data_url = _image_to_data_url(data, mime_type)

    response = llm.invoke(
        [
            (
                "system",
                """You are a design-system analyst.
Analyze the supplied brand/reference image and describe only information useful
for generating a digital design system.

Extract:
- visible colors and approximate hex values when confidently inferable
- typography/font characteristics
- spacing/layout characteristics
- component patterns
- borders/radii/shadows
- imagery/icon style
- visual tone
- explicit or strongly implied design rules

Do not invent exact measurements when the image does not support them.
Return a detailed plain-text description that can be chunked for semantic search.""",
            ),
            HumanMessage(
                content=[
                    {
                        "type": "text",
                        "text": f"Analyze this image: {filename}",
                    },
                    {
                        "type": "image_url",
                        "image_url": {"url": data_url},
                    },
                ]
            ),
        ]
    )

    return str(response.content)


def extract_pdf_text(
    data: bytes,
    project_id: str,
    document_id: str,
) -> list[Document]:
    pdf = fitz.open(stream=data, filetype="pdf")
    documents: list[Document] = []

    for page_number, page in enumerate(pdf):
        text = _normalize_text(page.get_text())
        if text:
            documents.append(
                Document(
                    page_content=text,
                    metadata={
                        "project_id": project_id,
                        "document_id": document_id,
                        "source": str(page_number + 1),
                        "page": page_number + 1,
                        "chunk_type": "pdf_text",
                    },
                )
            )

    # Scanned-image fallback for pages with no extractable text.
    scanned_pages = 0
    llm = get_llm()

    for page_number, page in enumerate(pdf):
        if scanned_pages >= settings.max_scanned_pdf_pages:
            break

        text = _normalize_text(page.get_text())
        if len(text) >= 40:
            continue

        pix = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5), alpha=False)
        image_bytes = pix.tobytes("png")
        description = analyze_image(
            image_bytes,
            "image/png",
            f"page-{page_number + 1}.png",
        )

        documents.append(
            Document(
                page_content=description,
                metadata={
                    "project_id": project_id,
                    "document_id": document_id,
                    "source": f"page-{page_number + 1}-vision",
                    "page": page_number + 1,
                    "chunk_type": "pdf_vision",
                },
            )
        )
        scanned_pages += 1

    return documents


def extract_source_documents(
    data: bytes,
    mime_type: str,
    filename: str,
    project_id: str,
    document_id: str,
) -> list[Document]:
    if mime_type in SUPPORTED_TEXT or Path(filename).suffix.lower() in {
        ".txt",
        ".md",
        ".json",
    }:
        if mime_type == "application/json" or Path(filename).suffix.lower() == ".json":
            try:
                parsed = json.loads(data.decode("utf-8"))
                text = json.dumps(parsed, indent=2, ensure_ascii=False)
            except Exception:
                text = data.decode("utf-8", errors="replace")
        else:
            text = data.decode("utf-8", errors="replace")

        return [
            Document(
                page_content=_normalize_text(text),
                metadata={
                    "project_id": project_id,
                    "document_id": document_id,
                    "source": filename,
                    "chunk_type": "text",
                },
            )
        ]

    if mime_type == "application/pdf" or Path(filename).suffix.lower() == ".pdf":
        return extract_pdf_text(
            data,
            project_id,
            document_id,
        )

    if mime_type in SUPPORTED_IMAGES:
        description = analyze_image(
            data,
            mime_type,
            filename,
        )
        return [
            Document(
                page_content=description,
                metadata={
                    "project_id": project_id,
                    "document_id": document_id,
                    "source": filename,
                    "chunk_type": "image_vision",
                },
            )
        ]

    raise ValueError(
        f"Unsupported file type: {mime_type or filename}"
    )


def ingest_document(
    *,
    project_id: str,
    document_id: str,
    storage_path: str,
    filename: str,
    mime_type: str,
) -> IngestResult:
    data = download_bytes(
        settings.supabase_brand_bucket,
        storage_path,
    )

    source_documents = extract_source_documents(
        data,
        mime_type,
        filename,
        project_id,
        document_id,
    )

    combined_text = "\n\n".join(
        document.page_content
        for document in source_documents
        if document.page_content.strip()
    )

    if not combined_text.strip():
        raise ValueError(
            "No usable text or visual description could be extracted."
        )

    current = get_design_tokens(project_id)

    token_payload = extract_design_tokens_from_text(
        project_id=project_id,
        source_name=filename,
        content=combined_text,
        existing_tokens=(current or {}).get("tokens"),
    )

    current_version = int(current["version"]) if current else 0

    merged_tokens = merge_design_tokens(
        (current or {}).get("tokens"),
        token_payload.model_dump(exclude_none=True),
    )

    upsert_design_tokens(
        project_id=project_id,
        version=current_version + 1,
        tokens=merged_tokens,
    )

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=settings.max_chunk_size,
        chunk_overlap=settings.chunk_overlap,
    )
    chunks = splitter.split_documents(source_documents)

    indexed_count =  add_documents(
        chunks,
        project_id=project_id,
    )

    update_document(
        document_id,
        {
            "status": "processed",
            "error_message": None,
        },
    )

    return IngestResult(
        extracted_text=combined_text,
        chunks_indexed=indexed_count,
        token_version=current_version + 1,
    )
