import json
from types import SimpleNamespace

import httpx

from regressa import Regressa, wrap_openai


def make_client(calls):
    def handler(request: httpx.Request) -> httpx.Response:
        calls.append({"url": str(request.url), "headers": dict(request.headers), "body": json.loads(request.content)})
        return httpx.Response(202, json={"accepted": 1, "rejected": 0, "errors": []})

    r = Regressa(api_key="rgsa_test_abc", base_url="http://ingest.local", flush_at=10)
    r._http = httpx.Client(transport=httpx.MockTransport(handler), headers=r._http.headers)
    return r


def test_trace_buffers_and_flushes_with_header():
    calls = []
    r = make_client(calls)
    r.trace(
        model="gpt-4o-mini", provider="openai", input_messages=[{"role": "user", "content": "hi"}], output_text="hello"
    )
    r.flush()
    assert len(calls) == 1
    assert calls[0]["url"] == "http://ingest.local/v1/traces"
    assert calls[0]["headers"]["x-regressa-project-key"] == "rgsa_test_abc"
    assert calls[0]["body"]["traces"][0]["id"]


def test_wrap_openai_records_usage_and_template():
    calls = []
    r = make_client(calls)

    def fake_create(**kwargs):
        return SimpleNamespace(
            model=kwargs["model"],
            choices=[SimpleNamespace(message=SimpleNamespace(content="pong"))],
            usage=SimpleNamespace(prompt_tokens=5, completion_tokens=1),
        )

    fake = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=fake_create)))
    client = wrap_openai(fake, r)
    res = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "system", "content": "You are a ping bot."}, {"role": "user", "content": "ping"}],
        regressa_prompt_template={"name": "ping", "raw": "You are a ping bot."},
    )
    assert res.choices[0].message.content == "pong"
    r.flush()
    t = calls[0]["body"]["traces"][0]
    assert t["output_text"] == "pong"
    assert t["prompt_tokens"] == 5
    assert t["prompt_template"]["name"] == "ping"
    assert t["status"] == "success"
