from __future__ import annotations

from functools import lru_cache
from typing import Any

import httpx
from supabase import Client, create_client
from supabase.lib.client_options import SyncClientOptions

from app.config import settings


@lru_cache
def get_supabase() -> Client:
    print("SUPABASE URL:", settings.supabase_url)
    print("SERVICE KEY PRESENT:", bool(settings.supabase_service_key))

    # Supabase's default PostgREST client enables HTTP/2, which can be
    # disconnected by some proxies or Supabase network paths.
    http_client = httpx.Client(
        http2=False,
        follow_redirects=True,
        timeout=httpx.Timeout(120.0),
    )

    return create_client(
        settings.supabase_url,
        settings.supabase_service_key,
        SyncClientOptions(httpx_client=http_client),
    )


def create_user(user_id: str, email: str, password_hash: str, name: str | None) -> dict[str, Any]:
    response = (
        get_supabase()
        .table("users")
        .insert(
            {
                "id": user_id,
                "email": email,
                "password_hash": password_hash,
                "name": name,
            }
        )
        .execute()
    )
    if not response.data:
        raise RuntimeError("Supabase did not return the created user.")
    return response.data[0]


def get_user_by_email(email: str) -> dict[str, Any] | None:
    response = (
        get_supabase()
        .table("users")
        .select("*")
        .eq("email", email)
        .maybe_single()
        .execute()
    )
    return response.data if response else None


def get_user(user_id: str) -> dict[str, Any] | None:
    response = (
        get_supabase()
        .table("users")
        .select("id,email,name,created_at")
        .eq("id", user_id)
        .maybe_single()
        .execute()
    )
    return response.data if response else None


def create_project(
    name: str,
    description: str | None,
    user_id: str,
) -> dict[str, Any]:
    response = (
        get_supabase()
        .table("projects")
        .insert(
            {
                "name": name,
                "description": description,
                "user_id": user_id,
            }
        )
        .execute()
    )
    if not response.data:
        raise RuntimeError("Supabase did not return the created project.")

    return response.data[0]


def get_project(project_id: str, user_id: str) -> dict[str, Any] | None:
    response = (
        get_supabase()
        .table("projects")
        .select("*")
        .eq("id", project_id)
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    # maybe_single().execute() can return None when no row matches.
    return response.data if response else None


def list_projects(user_id: str) -> list[dict[str, Any]]:
    response = (
        get_supabase()
        .table("projects")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return response.data or []


def delete_project(project_id: str, user_id: str) -> None:
    response = (
        get_supabase()
        .table("projects")
        .delete()
        .eq("id", project_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not response.data:
        raise RuntimeError(f"Project {project_id} was not deleted.")


def create_document(record: dict[str, Any]) -> dict[str, Any]:
    response = get_supabase().table("documents").insert(record).execute()
    if not response.data:
        raise RuntimeError("Supabase did not return the created document.")
    return response.data[0]


def update_document(document_id: str, values: dict[str, Any]) -> dict[str, Any]:
    response = (
        get_supabase()
        .table("documents")
        .update(values)
        .eq("id", document_id)
        .execute()
    )
    if not response.data:
        raise RuntimeError(f"Document {document_id} was not updated.")
    return response.data[0]


def get_document(document_id: str) -> dict[str, Any] | None:
    response = (
        get_supabase()
        .table("documents")
        .select("*")
        .eq("id", document_id)
        .maybe_single()
        .execute()
    )
    return response.data if response else None


def list_project_documents(project_id: str) -> list[dict[str, Any]]:
    response = (
        get_supabase()
        .table("documents")
        .select("*")
        .eq("project_id", project_id)
        .order("created_at", desc=True)
        .execute()
    )
    return response.data or []


def delete_document(document_id: str, project_id: str) -> None:
    response = (
        get_supabase()
        .table("documents")
        .delete()
        .eq("id", document_id)
        .eq("project_id", project_id)
        .execute()
    )
    if not response.data:
        raise RuntimeError(f"Document {document_id} was not deleted.")


def get_design_tokens(project_id: str) -> dict[str, Any] | None:
    response = (
        get_supabase()
        .table("design_tokens")
        .select("*")
        .eq("project_id", project_id)
        .limit(1)
        .execute()
    )

    if not response or not response.data:
        return None

    return response.data[0]


def upsert_design_tokens(
        project_id: str,
        version: int,
        tokens: dict[str, Any],
) -> dict[str, Any]:
    response = (
        get_supabase()
        .table("design_tokens")
        .upsert(
            {
                "project_id": project_id,
                "version": version,
                "tokens": tokens,
            },
            on_conflict="project_id",
        )
        .execute()
    )
    if not response.data:
        raise RuntimeError("Failed to store design tokens.")
    return response.data[0]


def create_artifact(record: dict[str, Any]) -> dict[str, Any]:
    response = get_supabase().table("generated_artifacts").insert(record).execute()
    if not response.data:
        raise RuntimeError("Failed to store generated artifact.")
    return response.data[0]


def update_artifact(artifact_id: str, project_id: str, values: dict[str, Any]) -> dict[str, Any]:
    response = (
        get_supabase()
        .table("generated_artifacts")
        .update(values)
        .eq("id", artifact_id)
        .eq("project_id", project_id)
        .execute()
    )
    if not response.data:
        raise RuntimeError("Failed to update generated artifact.")
    return response.data[0]


def get_artifact(artifact_id: str, project_id: str) -> dict[str, Any] | None:
    response = (
        get_supabase()
        .table("generated_artifacts")
        .select("*")
        .eq("id", artifact_id)
        .eq("project_id", project_id)
        .maybe_single()
        .execute()
    )
    return response.data if response else None


def list_artifacts(project_id: str) -> list[dict[str, Any]]:
    response = (
        get_supabase()
        .table("generated_artifacts")
        .select("*")
        .eq("project_id", project_id)
        .order("created_at", desc=True)
        .execute()
    )
    return response.data or []


def delete_artifact(artifact_id: str, project_id: str) -> None:
    response = (
        get_supabase()
        .table("generated_artifacts")
        .delete()
        .eq("id", artifact_id)
        .eq("project_id", project_id)
        .execute()
    )
    if not response.data:
        raise RuntimeError(f"Artifact {artifact_id} was not deleted.")