from __future__ import annotations

from app.db import get_design_tokens, list_project_documents
import json
from typing import Any

from langchain.tools import tool

from app.vector.store import search_documents



AGENT_SYSTEM_PROMPT = """
You are a brand-aware design planning agent.

Work only with the current project.

Tasks:
1. Retrieve the project's canonical design tokens.
2. Search project knowledge for relevant brand rules.
3. Inspect available brand assets when useful.
4. Produce a concise implementation brief for the generator.

Rules:
- Never invent brand rules.
- Never use information from another project.
- Prefer canonical tokens over guesses.
- Do not generate final code.
"""



def build_tools(project_id: str):

    @tool
    def get_design_tokens_tool() -> dict[str, Any]:
        """Get the canonical design tokens for the current project."""

        record = get_design_tokens(project_id)

        if not record:
            return {
                "project_id": project_id,
                "tokens": {},
            }

        return {
            "project_id": project_id,
            "version": record.get("version"),
            "tokens": record.get("tokens", {}),
        }

    @tool
    def search_brand_knowledge(query: str) -> list[dict[str, Any]]:
        """Search the current project's brand knowledge."""

        results = search_documents(
            project_id=project_id,
            query=query,
            top_k=6,
        )

        return [
            {
                "content": doc.page_content,
                "score": score,
                "source": doc.metadata.get("source"),
                "page": doc.metadata.get("page"),
                "document_id": doc.metadata.get("document_id"),
            }
            for doc, score in results
        ]

    @tool
    def list_brand_assets(search: str = "") -> list[dict[str, Any]]:
        """List brand assets belonging to the current project."""

        documents = list_project_documents(project_id)

        search_lower = search.strip().lower()

        matches = []

        for item in documents:
            filename = item["filename"]

            if search_lower and search_lower not in filename.lower():
                continue

            matches.append(
                {
                    "document_id": item["id"],
                    "filename": filename,
                    "mime_type": item["mime_type"],
                    "storage_path": item["storage_path"],
                    "status": item["status"],
                }
            )

        return matches[:20]

    return [
        get_design_tokens_tool,
        search_brand_knowledge,
        list_brand_assets,
    ]




def build_agent_context(project_id: str, user_prompt: str) -> dict[str, Any]:
    from langchain.agents import create_agent
    from app.llm import get_llm

    agent = create_agent(
        model=get_llm(),
        tools=build_tools(project_id),
        system_prompt=AGENT_SYSTEM_PROMPT,
        name="brand_design_agent",
    )

    result = agent.invoke(
        {
            "messages": [
                {
                    "role": "user",
                    "content": user_prompt,
                }
            ]
        }
    )

    messages = result.get("messages", [])
    final_message = messages[-1] if messages else None
    final_content = getattr(final_message, "content", "") if final_message else ""

    tool_outputs = []
    for message in messages:
        if getattr(message, "type", "") == "tool":
            tool_outputs.append(str(message.content))

    return {
        "agent_summary": final_content,
        "tool_context": tool_outputs,
    }
