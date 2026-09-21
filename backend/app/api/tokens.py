from fastapi import APIRouter, Depends, HTTPException

from app.auth import get_current_user
from app.api.projects import require_project
from app.db import get_design_tokens
from app.schemas import DesignTokensPayload, DesignTokensResponse


router = APIRouter(
    prefix="/api/projects/{project_id}",
    tags=["design-system"],
)


@router.get("/design-tokens", response_model=DesignTokensResponse)
def get_tokens(project_id: str, current_user: dict = Depends(get_current_user)):
    require_project(project_id, str(current_user["id"]))

    record = get_design_tokens(project_id)
    if not record:
        raise HTTPException(
            status_code=404,
            detail="No design tokens have been extracted for this project yet.",
        )

    return DesignTokensResponse(
        project_id=project_id,
        version=record["version"],
        tokens=DesignTokensPayload.model_validate(record["tokens"]),
    )
