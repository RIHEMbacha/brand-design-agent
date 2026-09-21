from __future__ import annotations

import logging
from typing import Any

from app.db import create_artifact, get_design_tokens, update_artifact
from app.llm import get_llm
from app.schemas import GeneratedUIOutput
from app.storage.files import upload_generated_zip
from app.validation.artifacts import validate_output

from .tools import build_tools

logger = logging.getLogger(__name__)

# The whole page is returned inside a single tool call, so the generator needs a
# large output budget (hidden reasoning tokens count against it too).
# Keep this within your Azure deployment's maximum output size.
GENERATION_MAX_TOKENS = 16000


GENERATOR_SYSTEM = """
You are a principal UI engineer and design-system compiler.

Generate complete implementation files from the user's request and project context.

Rules:
- Follow the user's request exactly.
- Use the supplied canonical design tokens.
- Never invent brand colors, fonts, spacing, radius, shadows, or layout values when tokens exist.
- Use conservative neutral fallbacks when a value is missing.
- Generate complete usable files.
- Do not return explanations instead of files.
- Do not use markdown code fences inside file contents.
- Do not use TODO, lorem ipsum, or placeholder content.
- Never expose secrets, API keys, credentials, or backend keys.
- applied_tokens must be a list of {name, value} objects.

HTML:
- Generate a complete standalone index.html.
- Include doctype, html, head, charset, viewport, title, and body.
- Put required CSS inside the HTML unless a separate CSS file is explicitly requested.
- Make the page professionally designed when opened directly.
- Use canonical tokens throughout the design.
- Use semantic accessible HTML.
- Include responsive behavior.
- Include hover and focus-visible states.
- Use clear hierarchy, spacing, and styled components.
- Do not generate a plain HTML skeleton.

Return only the GeneratedUIOutput structured object.
"""


def _normalize_file_content(content: str) -> str:
    """
    Fix content only when the model/provider returned double-escaped text
    (literal "\\n" sequences and no real newlines at all).
    """

    if not isinstance(content, str):
        return str(content)

    if "\n" not in content and "\\n" in content:
        content = content.encode(
            "latin-1", "backslashreplace"
        ).decode("unicode_escape")

    return content


def _invoke_structured(llm: Any, messages: list[dict[str, str]]) -> GeneratedUIOutput:
    """
    Call the model with structured output and, if parsing fails, raise an error
    that says WHY (truncation, refusal, invalid JSON) instead of returning None.
    """

    structured = llm.with_structured_output(
        GeneratedUIOutput,
        method="function_calling",
        include_raw=True,
    )

    result = structured.invoke(messages)

    parsed = result.get("parsed")
    if parsed is not None:
        return parsed

    raw = result.get("raw")
    metadata = getattr(raw, "response_metadata", None) or {}
    finish_reason = metadata.get("finish_reason")
    usage = getattr(raw, "usage_metadata", None)
    parsing_error = result.get("parsing_error")
    invalid_calls = getattr(raw, "invalid_tool_calls", None) or []
    args_tail = (invalid_calls[0].get("args") or "")[-200:] if invalid_calls else ""

    logger.error(
        "Structured parse failed | finish_reason=%s | usage=%s | "
        "parsing_error=%s | invalid_tool_calls=%d | args_tail=%r | content=%r",
        finish_reason,
        usage,
        parsing_error,
        len(invalid_calls),
        args_tail,
        str(getattr(raw, "content", ""))[:300],
    )

    hint = ""
    if finish_reason == "length":
        hint = " The response was truncated: raise GENERATION_MAX_TOKENS."

    raise RuntimeError(
        f"Structured output could not be parsed "
        f"(finish_reason={finish_reason}, parsing_error={parsing_error})."
        f"{hint}"
    )


def _validate_llm_output(
        output: Any,
        artifact_type: str,
) -> GeneratedUIOutput:

    logger.info(
        "Azure structured output type: %s",
        type(output).__name__,
    )

    if output is None:
        raise RuntimeError("LLM returned no structured output.")

    if not isinstance(output, GeneratedUIOutput):
        try:
            output = GeneratedUIOutput.model_validate(output)
        except Exception as exc:
            raise RuntimeError(
                f"Invalid LLM structured output: {exc}"
            ) from exc

    output.artifact_type = artifact_type

    for file in output.files:
        file.content = _normalize_file_content(file.content)

    if not output.files:
        raise RuntimeError("LLM generated no files.")

    return output


def build_agent_context(
        project_id: str,
        user_prompt: str,
) -> dict[str, Any]:

    from langchain.agents import create_agent

    agent = create_agent(
        model=get_llm(),
        tools=build_tools(project_id),
        system_prompt=(
            """
You are a design-context retrieval agent.

Retrieve only information needed to implement the user's request.

Return:
- relevant design tokens
- relevant brand rules
- relevant assets
- implementation constraints

Do not generate final code.
"""
        ),
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

    final_content = (
        getattr(final_message, "content", "")
        if final_message
        else ""
    )

    tool_outputs = []

    for message in messages:
        if getattr(message, "type", "") == "tool":
            tool_outputs.append(
                str(message.content)
            )

    return {
        "agent_summary": final_content,
        "tool_context": tool_outputs,
    }


def generate_artifact(
        project_id: str,
        artifact_type: str,
        user_prompt: str,
) -> GeneratedUIOutput:

    token_record = get_design_tokens(project_id)

    tokens = (
        (token_record or {}).get("tokens", {})
    )

    agent_context = build_agent_context(
        project_id,
        user_prompt,
    )

    # Only the agent's summary is passed on. tool_context repeats the same
    # design tokens that are already included above, so it is left out to
    # save prompt tokens.
    generation_prompt = f"""
Artifact type:
{artifact_type}

User request:
{user_prompt}

Canonical design tokens:
{tokens}

Design brief retrieved for this project:
{agent_context["agent_summary"]}

Generate the requested artifact now.
"""

    llm = get_llm()

    logger.info(
        "Generating %s artifact for project %s",
        artifact_type,
        project_id,
    )

    output = _invoke_structured(
        llm,
        [
            {
                "role": "system",
                "content": GENERATOR_SYSTEM,
            },
            {
                "role": "user",
                "content": generation_prompt,
            },
        ],
    )

    output = _validate_llm_output(
        output,
        artifact_type,
    )

    validate_output(output)

    return output


def persist_generated_artifact(
        project_id: str,
        artifact_type: str,
        user_prompt: str,
        output: GeneratedUIOutput,
) -> dict[str, Any]:

    files = [
        {
            "path": item.path,
            "language": item.language,
            "content": item.content,
        }
        for item in output.files
    ]

    # Keys must match the column names of your generated_artifacts table.
    artifact = create_artifact(
        {
            "project_id": project_id,
            "artifact_type": artifact_type,
            "prompt": user_prompt,
            "files": files,
            "output": output.model_dump(mode="json"),
        }
    )

    artifact_id = artifact["id"]

    zip_path = upload_generated_zip(
        project_id=project_id,
        artifact_id=artifact_id,
        files=files,
    )

    update_artifact(
        artifact_id=artifact_id,
        project_id=project_id,
        values={"zip_storage_path": zip_path},
    )

    return {
        "artifact_id": artifact_id,
        "project_id": project_id,
        "artifact_type": artifact_type,
        "output": output,
    }