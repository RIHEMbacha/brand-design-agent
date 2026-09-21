from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response

from app.auth import get_current_user
from app.api.projects import require_project
from app.config import settings
from app.db import create_document, delete_document, get_document, list_project_documents
from app.ingestion.service import ingest_document
from app.storage.files import delete_file, download_bytes, upload_project_file
from app.schemas import DocumentResponse
from uuid import uuid4


router = APIRouter(
    prefix="/api/projects/{project_id}/documents",
    tags=["documents"],
)

ALLOWED_MIME_TYPES = {
    "text/plain",
    "text/markdown",
    "application/json",
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/webp",
}


@router.get("", response_model=list[DocumentResponse])
def get_project_documents(
    project_id: str,
    current_user: dict = Depends(get_current_user),
):
    require_project(project_id, str(current_user["id"]))
    return list_project_documents(project_id)


@router.delete("/{document_id}", status_code=204)
def delete_project_document(
    project_id: str,
    document_id: str,
    current_user: dict = Depends(get_current_user),
):
    require_project(project_id, str(current_user["id"]))
    document = get_document(document_id)
    if not document or document.get("project_id") != project_id:
        raise HTTPException(status_code=404, detail="Document not found.")
    try:
        delete_file(settings.supabase_brand_bucket, document.get("storage_path", ""))
        delete_document(document_id, project_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Unable to delete document.") from exc


@router.get("/{document_id}/download")
def download_project_document(
    project_id: str,
    document_id: str,
    current_user: dict = Depends(get_current_user),
):
    require_project(project_id, str(current_user["id"]))

    document = get_document(document_id)
    if not document or document.get("project_id") != project_id:
        raise HTTPException(status_code=404, detail="Document not found.")

    try:
        content = download_bytes(
            settings.supabase_brand_bucket,
            document["storage_path"],
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail="Unable to download document.",
        ) from exc

    filename = document.get("filename") or f"{document_id}"
    mime_type = document.get("mime_type") or "application/octet-stream"

    return Response(
        content=content,
        media_type=mime_type,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )


@router.post("", response_model=DocumentResponse, status_code=201)
async def upload_document(
    project_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    require_project(project_id, str(current_user["id"]))

    content = await file.read()

    max_bytes = settings.max_upload_mb * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"File is larger than {settings.max_upload_mb} MB.",
        )

    mime_type = file.content_type or "application/octet-stream"
    filename = file.filename or "upload"

    suffix = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    allowed_extension = suffix in {"txt", "md", "json", "pdf", "png", "jpg", "jpeg", "webp"}

    if mime_type not in ALLOWED_MIME_TYPES and not allowed_extension:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type: {mime_type}",
        )

    document_id = str(uuid4())

    storage_path = upload_project_file(
        project_id=project_id,
        filename=filename,
        data=content,
        mime_type=mime_type,
    )

    row = create_document(
        {
            "id": document_id,
            "project_id": project_id,
            "filename": filename,
            "mime_type": mime_type,
            "storage_path": storage_path,
            "size_bytes": len(content),
            "status": "processing",
        }
    )

    try:
        ingest_document(
            project_id=project_id,
            document_id=document_id,
            storage_path=storage_path,
            filename=filename,
            mime_type=mime_type,
        )
    except Exception as exc:
        from app.db import update_document

        update_document(
            document_id,
            {
                "status": "failed",
                "error_message": str(exc)[:2000],
            },
        )
        raise HTTPException(
            status_code=500,
            detail=f"Document ingestion failed: {exc}",
        ) from exc

    from app.db import get_document

    updated = get_document(document_id)
    return updated or row
