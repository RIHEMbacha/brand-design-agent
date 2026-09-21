from __future__ import annotations

import re
import xml.etree.ElementTree as ET

from app.schemas import GeneratedUIOutput


HEX_COLOR_RE = re.compile(r"#[0-9a-fA-F]{3,8}")


def _validate_html(content: str) -> list[str]:
    errors: list[str] = []

    if "<script" in content.lower():
        errors.append("HTML contains <script>, which is not allowed in generated previews.")

    if re.search(r"\son[a-z]+\s*=", content, flags=re.IGNORECASE):
        errors.append("HTML contains inline event handlers, which are not allowed.")

    if not re.search(r"<(html|main|section|div)\b", content, flags=re.IGNORECASE):
        errors.append("HTML output does not contain a recognizable layout element.")

    return errors


def _validate_css(content: str) -> list[str]:
    errors: list[str] = []

    if re.search(r"expression\s*\(", content, flags=re.IGNORECASE):
        errors.append("CSS contains expression(), which is not allowed.")

    if "javascript:" in content.lower():
        errors.append("CSS contains javascript:, which is not allowed.")

    return errors


def _validate_xml(content: str) -> list[str]:
    errors: list[str] = []

    try:
        ET.fromstring(content)
    except ET.ParseError as exc:
        errors.append(f"Invalid XML: {exc}")

    return errors


def validate_output(output: GeneratedUIOutput) -> list[str]:
    errors: list[str] = []

    if not output.files:
        errors.append("The model returned no files.")
        return errors

    for file in output.files:
        path = file.path.lower()
        content = file.content

        if path.endswith((".html", ".htm")):
            errors.extend(_validate_html(content))

        if path.endswith(".css"):
            errors.extend(_validate_css(content))

        if path.endswith(".xml"):
            errors.extend(_validate_xml(content))

        if "sk-" in content.lower():
            errors.append(
                f"{file.path} appears to contain an API key prefix; secrets are forbidden."
            )

    return errors
