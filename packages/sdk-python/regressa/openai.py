from __future__ import annotations

import time
from typing import Any

from .client import Regressa, is_timeout
from .template import infer_template


def wrap_openai(client: Any, regressa: Regressa, **defaults: Any) -> Any:
    """Instrument an `openai.OpenAI` client's chat.completions.create (sync, incl. stream=True).

    Extra per-call kwargs understood by Regressa (stripped before hitting OpenAI):
        regressa_prompt_template={"name": ..., "raw": ...}, regressa_trace_group_id=..., regressa_metadata={...}
    """
    original = client.chat.completions.create

    def create(*args: Any, **kwargs: Any) -> Any:
        opts = _pop_opts(kwargs, defaults)
        messages = kwargs.get("messages", [])
        base: dict[str, Any] = {
            "model": kwargs.get("model", "unknown"),
            "provider": "openai",
            "input_messages": messages,
            "prompt_template": opts.get("prompt_template") or infer_template(messages),
            "trace_group_id": opts.get("trace_group_id"),
            "metadata": opts.get("metadata"),
        }
        started = time.perf_counter()
        try:
            res = original(*args, **kwargs)
        except Exception as exc:
            regressa.trace(
                **base,
                latency_ms=_ms(started),
                status="timeout" if is_timeout(exc) else "error",
                error_message=str(exc),
            )
            raise
        if kwargs.get("stream"):
            return _StreamProxy(res, regressa, base, started, _openai_chunk)
        usage = getattr(res, "usage", None)
        choice = res.choices[0] if getattr(res, "choices", None) else None
        regressa.trace(
            **{**base, "model": getattr(res, "model", None) or base["model"]},
            output_text=getattr(getattr(choice, "message", None), "content", None),
            prompt_tokens=getattr(usage, "prompt_tokens", None),
            completion_tokens=getattr(usage, "completion_tokens", None),
            latency_ms=_ms(started),
            status="success",
        )
        return res

    client.chat.completions.create = create
    return client


def _openai_chunk(chunk: Any, state: dict[str, Any]) -> None:
    if getattr(chunk, "model", None):
        state["model"] = chunk.model
    choices = getattr(chunk, "choices", None) or []
    if choices and getattr(choices[0], "delta", None) is not None:
        delta = getattr(choices[0].delta, "content", None)
        if delta:
            state["chunks"].append(delta)
    usage = getattr(chunk, "usage", None)
    if usage is not None:
        state["prompt_tokens"] = getattr(usage, "prompt_tokens", None)
        state["completion_tokens"] = getattr(usage, "completion_tokens", None)


class _StreamProxy:
    """Iterates the underlying stream, records a trace when it finishes (or errors)."""

    def __init__(self, stream: Any, regressa: Regressa, base: dict[str, Any], started: float, on_chunk: Any) -> None:
        self._stream, self._regressa, self._base, self._started, self._on_chunk = (
            stream,
            regressa,
            base,
            started,
            on_chunk,
        )
        self._state: dict[str, Any] = {"chunks": [], "model": None, "prompt_tokens": None, "completion_tokens": None}

    def __iter__(self):
        try:
            for chunk in self._stream:
                self._on_chunk(chunk, self._state)
                yield chunk
        except Exception as exc:
            self._regressa.trace(
                **self._base,
                output_text="".join(self._state["chunks"]),
                latency_ms=_ms(self._started),
                status="error",
                error_message=str(exc),
            )
            raise
        s = self._state
        self._regressa.trace(
            **{**self._base, "model": s["model"] or self._base["model"]},
            output_text="".join(s["chunks"]),
            prompt_tokens=s["prompt_tokens"],
            completion_tokens=s["completion_tokens"],
            latency_ms=_ms(self._started),
            status="success",
        )

    def __getattr__(self, item: str) -> Any:
        return getattr(self._stream, item)


def _pop_opts(kwargs: dict[str, Any], defaults: dict[str, Any]) -> dict[str, Any]:
    opts = dict(defaults)
    for key in ("prompt_template", "trace_group_id", "metadata"):
        val = kwargs.pop(f"regressa_{key}", None)
        if val is not None:
            opts[key] = val
    return opts


def _ms(started: float) -> int:
    return int((time.perf_counter() - started) * 1000)
