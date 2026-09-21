from __future__ import annotations

import copy
from typing import Any

from pydantic import BaseModel

from app.llm import get_llm
from app.schemas import DesignTokensPayload


EXTRACTION_SYSTEM_PROMPT = """You are an expert brand identity and design-system analyst.

Extract a canonical design system from the supplied brand material.

Rules:
- Use only evidence contained in the supplied material.
- Never invent exact values.
- If a value is uncertain, omit it or describe it qualitatively.
- Preserve explicit color hex values exactly.
- Extract typography, spacing, radii, shadows, components, layout, imagery,
  tone, rules and prohibited patterns when available.
- Prefer reusable design tokens over prose.
- The result will be stored as the project's canonical design system.
"""


def extract_design_tokens_from_text(
    *,
    project_id: str,
    source_name: str,
    content: str,
    existing_tokens: dict[str, Any] | None,
) -> DesignTokensPayload:
    llm = get_llm()
    structured = llm.with_structured_output(
        DesignTokensPayload,
        method="function_calling",
    )

    prompt = f"""
{EXTRACTION_SYSTEM_PROMPT}

Project ID: {project_id}
Source document: {source_name}

Existing project tokens:
{existing_tokens or "{}"}

New source content:
{content[:50000]}

When existing tokens exist, preserve values that remain supported by the evidence
and add/strengthen tokens supported by the new source.
"""

    return structured.invoke(prompt)


def merge_design_tokens(
    current: dict[str, Any] | None,
    incoming: dict[str, Any],
) -> dict[str, Any]:
    if not current:
        return copy.deepcopy(incoming)

    result = copy.deepcopy(current)

    def merge(a: dict[str, Any], b: dict[str, Any]) -> None:
        for key, value in b.items():
            if isinstance(value, dict) and isinstance(a.get(key), dict):
                merge(a[key], value)
            elif value not in (None, "", [], {}):
                a[key] = value
            elif key not in a:
                a[key] = value

    merge(result, incoming)
    return result
