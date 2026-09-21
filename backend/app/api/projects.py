from fastapi import APIRouter, Depends, HTTPException

from app.auth import get_current_user
from app.db import create_project, delete_project, get_project, list_projects, list_project_documents, list_artifacts
from app.storage.files import delete_file
from app.config import settings
from app.schemas import ProjectCreate, ProjectResponse


router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.post("", response_model=ProjectResponse, status_code=201)
def create_project_endpoint(
    payload: ProjectCreate,
    current_user: dict = Depends(get_current_user),
):
    try:
        row = create_project(
            payload.name,
            payload.description,
            str(current_user["id"]),
        )
        return row
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("", response_model=list[ProjectResponse])
def list_projects_endpoint(current_user: dict = Depends(get_current_user)):
    return list_projects(str(current_user["id"]))


@router.delete("/{project_id}", status_code=204)
def delete_project_endpoint(
    project_id: str,
    current_user: dict = Depends(get_current_user),
):
    project = require_project(project_id, str(current_user["id"]))
    try:
        for document in list_project_documents(project_id):
            delete_file(settings.supabase_brand_bucket, document.get("storage_path", ""))
        for artifact in list_artifacts(project_id):
            delete_file(settings.supabase_artifact_bucket, artifact.get("zip_storage_path", ""))
        delete_project(project["id"], str(current_user["id"]))
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Unable to delete project.") from exc


def require_project(project_id: str, user_id: str) -> dict:
    project = get_project(project_id, user_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")
    return project
