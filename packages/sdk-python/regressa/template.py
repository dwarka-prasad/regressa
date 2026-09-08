from __future__ import annotations

import hashlib
from typing import Any


def content_to_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict) and "text" in block:
                parts.append(str(block["text"]))
            elif hasattr(block, "text"):
                parts.append(str(block.text))
        return "".join(parts)
    return ""


def infer_template(messages: list[dict[str, Any]], system: Any = None) -> dict[str, str] | None:
    """Fallback template detection: the system prompt is treated as the template.

    Pass prompt_template={"name": ..., "raw": ...} explicitly for accurate version tracking.
    """
    sys_text = system if isinstance(system, str) else None
    if sys_text is None:
        for m in messages:
            if m.get("role") == "system":
                sys_text = content_to_text(m.get("content"))
                break
    if not sys_text:
        return None
    digest = hashlib.sha1(sys_text.encode("utf-8")).hexdigest()[:8]
    return {"name": f"system:{digest}", "raw": sys_text}
