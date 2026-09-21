from __future__ import annotations

import io
from pathlib import Path
from uuid import uuid4

from io import BytesIO
from zipfile import ZipFile

from app.config import settings
from app.db import get_supabase

def create_zip(files: list[dict]) -> bytes:
    """
    Create a ZIP containing generated files.

    File content is written directly as UTF-8 text.
    Do NOT JSON serialize file content.
    """

    buffer = BytesIO()

    with ZipFile(buffer, "w") as zip_file:

        for file in files:
            path = file["path"]
            content = file["content"]

            if not isinstance(content, str):
                content = str(content)

            zip_file.writestr(
                path,
                content.encode("utf-8"),
            )

    return buffer.getvalue()


def upload_generated_zip(
        project_id: str,
        artifact_id: str,
        files: list[dict],
) -> str:

    zip_bytes = create_zip(files)

    storage_path = (
        f"projects/"
        f"{project_id}/"
        f"artifacts/"
        f"{artifact_id}.zip"
    )

    get_supabase().storage \
        .from_(settings.supabase_artifact_bucket) \
        .upload(
        storage_path,
        zip_bytes,
        {
            "content-type": "application/zip",
            "upsert": "true",
        },
    )

    return storage_path

def upload_bytes(
    bucket: str,
    path: str,
    data: bytes,
    mime_type: str,
) -> None:
    get_supabase().storage.from_(bucket).upload(
        path=path,
        file=data,
        file_options={
            "content-type": mime_type,
            "cache-control": "3600",
            "upsert": "false",
        },
    )


def download_bytes(bucket: str, path: str) -> bytes:
    return get_supabase().storage.from_(bucket).download(path)


def delete_file(bucket: str, path: str) -> None:
    if not path:
        return
    get_supabase().storage.from_(bucket).remove([path])


def create_signed_url(bucket: str, path: str) -> str | None:
    response = get_supabase().storage.from_(bucket).create_signed_url(
        path,
        settings.signed_url_ttl_seconds,
    )
    data = response.get("data") if isinstance(response, dict) else None
    if isinstance(data, dict):
        return data.get("signedURL") or data.get("signedUrl")
    return None


def upload_project_file(
    project_id: str,
    filename: str,
    data: bytes,
    mime_type: str,
) -> str:
    safe_name = Path(filename).name
    path = f"projects/{project_id}/documents/{uuid4()}-{safe_name}"
    upload_bytes(
        settings.supabase_brand_bucket,
        path,
        data,
        mime_type,
    )
    return path

