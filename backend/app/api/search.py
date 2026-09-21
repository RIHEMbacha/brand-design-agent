from fastapi import APIRouter, Depends

from app.auth import get_current_user
from app.api.projects import require_project
from app.schemas import SearchRequest, SearchResponse, SearchResult
from app.vector.store import search_documents


router = APIRouter(
    prefix="/api/projects/{project_id}",
    tags=["search"],
)


@router.post("/search", response_model=SearchResponse)
def search(
    project_id: str,
    payload: SearchRequest,
    current_user: dict = Depends(get_current_user),
):
    require_project(project_id, str(current_user["id"]))

    results = search_documents(
        project_id=project_id,
        query=payload.query,
        top_k=payload.top_k,
    )

    return SearchResponse(
        project_id=project_id,
        query=payload.query,
        results=[
            SearchResult(
                content=doc.page_content,
                score=float(score),
                source=doc.metadata.get("source"),
                page=doc.metadata.get("page"),
                document_id=doc.metadata.get("document_id"),
            )
            for doc, score in results
        ],
    )
