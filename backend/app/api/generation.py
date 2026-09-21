import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import ValidationError

from app.auth import get_current_user
from app.agent.generator import (
    generate_artifact,
    persist_generated_artifact,
)
from app.api.projects import require_project
from app.config import settings
from app.db import delete_artifact, get_artifact, list_artifacts
from app.storage.files import delete_file, download_bytes
from app.schemas import (
    GeneratedArtifactRecord,
    GeneratedArtifactResponse,
    GeneratedUIOutput,
    GenerationRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/projects/{project_id}",
    tags=["generation"],
)


def _normalize_artifact_record(record: dict) -> dict:
    record = {key: value for key, value in record.items() if key != "name"}
    raw_output = record.get("output")

    if raw_output is not None:
        try:
            GeneratedUIOutput.model_validate(raw_output)
        except ValidationError:
            raw_output = None

    if raw_output is None:
        raw_files = record.get("files")
        files = raw_files if isinstance(raw_files, list) else []
        try:
            fallback_output = GeneratedUIOutput(
                artifact_type=record["artifact_type"],
                title=record.get("prompt") or "Generated artifact",
                files=files,
                warnings=["This artifact was created before generated output was stored."],
            )
        except ValidationError:
            fallback_output = GeneratedUIOutput(
                artifact_type=record["artifact_type"],
                title=record.get("prompt") or "Generated artifact",
                files=[],
                warnings=["Generated files could not be restored for this legacy artifact."],
            )
        record = {**record, "output": fallback_output}

    return record


@router.post(
    "/generate",
    response_model=GeneratedArtifactResponse,
)
def generate(
        project_id: str,
        payload: GenerationRequest,
        current_user: dict = Depends(get_current_user),
):
    require_project(project_id, str(current_user["id"]))

    try:
        # The generator retrieves design tokens, brand knowledge, brand assets
        # and implementation context, then produces the files.
        output = generate_artifact(
            project_id=project_id,
            artifact_type=payload.artifact_type,
            user_prompt=payload.prompt,
        )

        # Persist generated files and create the ZIP.
        result = persist_generated_artifact(
            project_id=project_id,
            artifact_type=payload.artifact_type,
            user_prompt=payload.prompt,
            output=output,
        )

        return GeneratedArtifactResponse(
            artifact_id=result["artifact_id"],
            project_id=project_id,
            artifact_type=result["artifact_type"],
            output=result["output"],
        )

    except Exception as exc:
        # Full traceback goes to the server log; the client gets the short message.
        logger.exception("Generation failed for project %s", project_id)
        raise HTTPException(
            status_code=500,
            detail=f"Generation failed: {exc}",
        ) from exc


@router.get(
    "/artifacts",
    response_model=list[GeneratedArtifactRecord],
)
def get_project_artifacts(
    project_id: str,
    current_user: dict = Depends(get_current_user),
):
    require_project(project_id, str(current_user["id"]))
    return [_normalize_artifact_record(item) for item in list_artifacts(project_id)]


@router.get(
    "/artifacts/{artifact_id}",
    response_model=GeneratedArtifactRecord,
)
def get_project_artifact(
    project_id: str,
    artifact_id: str,
    current_user: dict = Depends(get_current_user),
):
    require_project(project_id, str(current_user["id"]))
    artifact = get_artifact(artifact_id, project_id)
    if not artifact:
        raise HTTPException(status_code=404, detail="Generated artifact not found.")
    return _normalize_artifact_record(artifact)


@router.delete("/artifacts/{artifact_id}", status_code=204)
def delete_project_artifact(
    project_id: str,
    artifact_id: str,
    current_user: dict = Depends(get_current_user),
):
    require_project(project_id, str(current_user["id"]))
    artifact = get_artifact(artifact_id, project_id)
    if not artifact:
        raise HTTPException(status_code=404, detail="Generated artifact not found.")
    try:
        delete_file(settings.supabase_artifact_bucket, artifact.get("zip_storage_path", ""))
        delete_artifact(artifact_id, project_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Unable to delete generated artifact.") from exc


@router.get("/artifacts/{artifact_id}/zip")
def download_project_artifact_zip(
    project_id: str,
    artifact_id: str,
    current_user: dict = Depends(get_current_user),
):
    require_project(project_id, str(current_user["id"]))
    artifact = get_artifact(artifact_id, project_id)
    if not artifact:
        raise HTTPException(status_code=404, detail="Generated artifact not found.")

    storage_path = artifact.get("zip_storage_path")
    if not storage_path:
        raise HTTPException(status_code=404, detail="Artifact ZIP is not available.")

    try:
        zip_bytes = download_bytes(settings.supabase_artifact_bucket, storage_path)
    except Exception as exc:
        logger.exception("Artifact ZIP download failed for %s", artifact_id)
        raise HTTPException(
            status_code=502,
            detail="Unable to download artifact ZIP.",
        ) from exc

    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{artifact_id}.zip"',
        },
    )