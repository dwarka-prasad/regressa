from __future__ import annotations

import atexit
import json
import os
import threading
import time
import uuid
import warnings
from datetime import datetime, timezone
from typing import Any, Callable

import httpx

SDK_NAME = "regressa-sdk"
SDK_VERSION = "0.1.0"
KEY_HEADER = "X-Regressa-Project-Key"
DEFAULT_BASE_URL = "https://ingest.regressa.dev"


class Regressa:
    """Buffered, background-flushing trace client.

    Args:
        api_key: rgsa_live_... / rgsa_test_... (default: REGRESSA_API_KEY env var)
        base_url: ingestion base URL (default: REGRESSA_BASE_URL or https://ingest.regressa.dev)
        flush_at: buffer size that triggers a flush
        flush_interval: seconds a trace may sit in the buffer before a flush
        disabled: no-op mode (default: REGRESSA_DISABLED=1)
        redact: callable(messages) -> messages, applied before send
        default_metadata: merged into every trace's metadata
    """

    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
        flush_at: int = 50,
        flush_interval: float = 2.0,
        disabled: bool | None = None,
        redact: Callable[[list[dict[str, Any]]], list[dict[str, Any]]] | None = None,
        default_metadata: dict[str, Any] | None = None,
        timeout: float = 5.0,
    ) -> None:
        self.api_key = api_key or os.environ.get("REGRESSA_API_KEY", "")
        self.base_url = (base_url or os.environ.get("REGRESSA_BASE_URL") or DEFAULT_BASE_URL).rstrip("/")
        self.flush_at = flush_at
        self.flush_interval = flush_interval
        self.disabled = disabled if disabled is not None else os.environ.get("REGRESSA_DISABLED") == "1"
        self.redact = redact
        self.default_metadata = default_metadata or {}
        self._buffer: list[dict[str, Any]] = []
        self._lock = threading.Lock()
        self._timer: threading.Timer | None = None
        self._warned = False
        self._http = httpx.Client(
            timeout=timeout,
            headers={
                "Content-Type": "application/json",
                KEY_HEADER: self.api_key,
                "User-Agent": f"{SDK_NAME}/{SDK_VERSION}",
            },
        )
        if not self.api_key and not self.disabled:
            warnings.warn("[regressa] no API key set (REGRESSA_API_KEY). Tracing disabled.", stacklevel=2)
            self.disabled = True
        atexit.register(self.shutdown)

    # ---- public API -------------------------------------------------------

    def trace(self, **trace: Any) -> None:
        """Record a trace. Keys mirror the ingest schema (model, provider, input_messages, output_text, ...)."""
        if self.disabled:
            return
        trace.setdefault("id", str(uuid.uuid4()))
        trace.setdefault("timestamp", datetime.now(timezone.utc).isoformat())
        if self.redact and "input_messages" in trace:
            trace["input_messages"] = self.redact(trace["input_messages"])
        trace["metadata"] = {**self.default_metadata, **(trace.get("metadata") or {})}
        with self._lock:
            self._buffer.append(trace)
            should_flush = len(self._buffer) >= self.flush_at
            if not should_flush and self._timer is None:
                self._timer = threading.Timer(self.flush_interval, self.flush)
                self._timer.daemon = True
                self._timer.start()
        if should_flush:
            self.flush()

    def flush(self) -> None:
        with self._lock:
            if self._timer is not None:
                self._timer.cancel()
                self._timer = None
            batch, self._buffer = self._buffer, []
        if batch:
            self._send(batch)

    def shutdown(self) -> None:
        self.flush()

    # ---- internals --------------------------------------------------------

    def _send(self, traces: list[dict[str, Any]], attempt: int = 0) -> None:
        body = json.dumps({"traces": traces, "sdk": {"name": SDK_NAME, "version": SDK_VERSION}}, default=str)
        try:
            res = self._http.post(f"{self.base_url}/v1/traces", content=body)
            if res.status_code == 429 or res.status_code >= 500:
                raise httpx.HTTPStatusError(f"regressa ingest {res.status_code}", request=res.request, response=res)
            if res.status_code >= 400:
                self._warn(f"regressa ingest {res.status_code}: {res.text[:200]}")
        except Exception as exc:  # noqa: BLE001
            if attempt < 3:
                time.sleep(0.25 * (2**attempt))
                return self._send(traces, attempt + 1)
            self._warn(str(exc))

    def _warn(self, msg: str) -> None:
        if not self._warned:
            self._warned = True
            warnings.warn(f"[regressa] failed to send traces: {msg}", stacklevel=2)


def is_timeout(exc: BaseException) -> bool:
    name = type(exc).__name__.lower()
    return "timeout" in name or "timed out" in str(exc).lower()
