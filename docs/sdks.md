# SDKs

All SDKs share the same wire format and behavior: buffered, batched, retried on 429/5xx, and never throw into
your application. Each declares the prompt template so Regressa can version it.

## Node · `@regressa/node`

```ts
import OpenAI from "openai";
import { Regressa, wrapOpenAI } from "@regressa/node";

const regressa = new Regressa({ apiKey: process.env.REGRESSA_API_KEY });
const openai = wrapOpenAI(new OpenAI(), regressa);

await openai.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [{ role: "system", content: prompt }, { role: "user", content: q }],
  regressa: { promptTemplate: { name: "support-agent", raw: PROMPT_TEMPLATE }, metadata: { tenant } },
});
await regressa.shutdown();
```

Also: `wrapAnthropic`, `regressa.trace()` for manual calls, `regressa.span()` for any async call, streaming
support for both providers, `redact` hook, `defaultMetadata`. CLI: `npx @regressa/node gate` (see [CI gate](ci-gate.md)).

## Python · `regressa-sdk`

```python
from openai import OpenAI
from regressa import Regressa, wrap_openai

regressa = Regressa()  # REGRESSA_API_KEY
openai = wrap_openai(OpenAI(), regressa)
openai.chat.completions.create(model="gpt-4o-mini", messages=msgs,
    regressa_prompt_template={"name": "support-agent", "raw": PROMPT_TEMPLATE})
```

Also `wrap_anthropic`, streaming, `redact`, `default_metadata`, `atexit` flush.

## Go · `github.com/dwarka-prasad/regressa-go`

```go
client := regressa.New(regressa.Options{})
defer client.Shutdown(ctx)
span := client.Start("gpt-4o-mini", regressa.OpenAI, msgs, regressa.WithTemplate("support-agent", tmpl))
resp, err := provider.Call(ctx, req)
span.End(resp.Text, resp.PromptTokens, resp.CompletionTokens, err)
```

## Java · `dev.regressa:regressa-sdk`

```java
Regressa regressa = Regressa.builder().build();
Regressa.Span span = regressa.start("gpt-4o-mini", "openai").message("system", prompt).message("user", q).template("support-agent", TEMPLATE);
try { span.end(out, promptTokens, completionTokens); } catch (Exception e) { span.fail(e); throw e; }
```

## OpenTelemetry

Point your OTLP/HTTP exporter at `POST /v1/otlp/traces` with the `X-Regressa-Project-Key` header. Spans with
`gen_ai.request.model` are mapped; see [governance.md](governance.md#opentelemetry-ingestion).

## Environment variables (all SDKs)

| Variable | Meaning |
|---|---|
| `REGRESSA_API_KEY` | `rgsa_live_...` or `rgsa_test_...` |
| `REGRESSA_BASE_URL` | Ingest URL (default `https://ingest.regressa.dev`; `http://localhost:4100` locally) |
| `REGRESSA_DISABLED=1` | Turn tracing off |
