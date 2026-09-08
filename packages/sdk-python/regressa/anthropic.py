from __future__ import annotations

import time
from typing import Any

from .client import Regressa, is_timeout
from .openai import _ms, _pop_opts, _StreamProxy
from .template import infer_template


def wrap_anthropic(client: Any, regressa: Regressa, **defaults: Any) -> Any:
    """Instrument an `anthropic.Anthropic` client's messages.create (sync, incl. stream=True)."""
    original = client.messages.create

    def create(*args: Any, **kwargs: Any) -> Any:
        opts = _pop_opts(kwargs, defaults)
        messages = list(kwargs.get("messages", []))
        system = kwargs.get("system")
        input_messages = ([{"role": "system", "content": system}] + messages) if system else messages
        base: dict[str, Any] = {
            "model": kwargs.get("model", "unknown"),
            "provider": "anthropic",
            "input_messages": input_messages,
            "prompt_template": opts.get("prompt_template") or infer_template(messages, system),
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
            return _StreamProxy(res, regressa, base, started, _anthropic_event)
        usage = getattr(res, "usage", None)
        text = "".join(
            getattr(b, "text", "") for b in (getattr(res, "content", None) or []) if getattr(b, "type", "") == "text"
        )
        regressa.trace(
            **{**base, "model": getattr(res, "model", None) or base["model"]},
            output_text=text,
            prompt_tokens=getattr(usage, "input_tokens", None),
            completion_tokens=getattr(usage, "output_tokens", None),
            latency_ms=_ms(started),
            status="success",
        )
        return res

    client.messages.create = create
    return client


def _anthropic_event(ev: Any, state: dict[str, Any]) -> None:
    t = getattr(ev, "type", None)
    if t == "message_start":
        msg = getattr(ev, "message", None)
        state["model"] = getattr(msg, "model", None)
        state["prompt_tokens"] = getattr(getattr(msg, "usage", None), "input_tokens", None)
    elif t == "content_block_delta" and getattr(getattr(ev, "delta", None), "type", "") == "text_delta":
        state["chunks"].append(ev.delta.text)
    elif t == "message_delta":
        out = getattr(getattr(ev, "usage", None), "output_tokens", None)
        if out is not None:
            state["completion_tokens"] = out
