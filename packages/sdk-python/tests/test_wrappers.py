import json
from types import SimpleNamespace

import httpx
import pytest

from regressa import Regressa, infer_template, wrap_anthropic, wrap_openai


def make_client(calls, status=202):
    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(json.loads(request.content))
        return httpx.Response(status, json={"accepted": 1, "rejected": 0, "errors": []})

    r = Regressa(api_key="rgsa_test_abc", base_url="http://ingest.local", flush_at=100, flush_interval=60)
    r._http = httpx.Client(transport=httpx.MockTransport(handler), headers=r._http.headers)
    return r


def test_infer_template_uses_system_prompt():
    a = infer_template([{"role": "system", "content": "You are X."}, {"role": "user", "content": "hi"}])
    b = infer_template([], system="You are X.")
    assert a == b
    assert a["name"].startswith("system:")
    assert infer_template([{"role": "user", "content": "hi"}]) is None
    assert (
        infer_template([{"role": "system", "content": [{"type": "text", "text": "A"}, {"type": "text", "text": "B"}]}])[
            "raw"
        ]
        == "AB"
    )


def test_wrap_anthropic_folds_system_and_reads_text_blocks():
    calls = []
    r = make_client(calls)

    def create(**kwargs):
        return SimpleNamespace(
            model=kwargs["model"],
            content=[SimpleNamespace(type="text", text="Hi "), SimpleNamespace(type="text", text="there")],
            usage=SimpleNamespace(input_tokens=7, output_tokens=2),
        )

    client = wrap_anthropic(SimpleNamespace(messages=SimpleNamespace(create=create)), r)
    client.messages.create(model="claude-sonnet-5", system="Be brief.", messages=[{"role": "user", "content": "hello"}])
    r.flush()
    t = calls[0]["traces"][0]
    assert t["input_messages"][0] == {"role": "system", "content": "Be brief."}
    assert t["output_text"] == "Hi there"
    assert t["prompt_tokens"] == 7 and t["completion_tokens"] == 2
    assert t["provider"] == "anthropic"
    assert t["prompt_template"]["raw"] == "Be brief."


def test_wrap_openai_records_errors_and_reraises():
    calls = []
    r = make_client(calls)

    def create(**kwargs):
        raise RuntimeError("429 rate limited")

    client = wrap_openai(SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create))), r)
    with pytest.raises(RuntimeError):
        client.chat.completions.create(model="gpt-4o", messages=[{"role": "user", "content": "x"}])
    r.flush()
    t = calls[0]["traces"][0]
    assert t["status"] == "error"
    assert "429" in t["error_message"]


def test_wrap_openai_stream_assembles_chunks():
    calls = []
    r = make_client(calls)
    chunks = [
        SimpleNamespace(
            model="gpt-4o-mini", choices=[SimpleNamespace(delta=SimpleNamespace(content="Hel"))], usage=None
        ),
        SimpleNamespace(
            model=None,
            choices=[SimpleNamespace(delta=SimpleNamespace(content="lo"))],
            usage=SimpleNamespace(prompt_tokens=3, completion_tokens=2),
        ),
    ]

    def create(**kwargs):
        return iter(chunks)

    client = wrap_openai(SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create))), r)
    got = list(
        client.chat.completions.create(model="gpt-4o-mini", messages=[{"role": "user", "content": "hi"}], stream=True)
    )
    assert len(got) == 2
    r.flush()
    t = calls[0]["traces"][0]
    assert t["output_text"] == "Hello"
    assert t["prompt_tokens"] == 3 and t["completion_tokens"] == 2


def test_redaction_and_default_metadata():
    calls = []
    r = make_client(calls)
    r.redact = lambda msgs: [{**m, "content": "[redacted]"} for m in msgs]
    r.default_metadata = {"env": "test"}
    r.trace(
        model="m", provider="other", input_messages=[{"role": "user", "content": "secret"}], metadata={"user": "u1"}
    )
    r.flush()
    t = calls[0]["traces"][0]
    assert t["input_messages"][0]["content"] == "[redacted]"
    assert t["metadata"] == {"env": "test", "user": "u1"}


def test_disabled_client_sends_nothing():
    calls = []
    r = make_client(calls)
    r.disabled = True
    r.trace(model="m", provider="other", input_messages=[])
    r.flush()
    assert calls == []
