import { describe, expect, it, vi } from "vitest";
import { Regressa } from "./client.js";
import { wrapOpenAI } from "./openai.js";
import { wrapAnthropic } from "./anthropic.js";
import { inferTemplate } from "./template.js";

function fakeFetch(status = 200) {
  const calls: { url: string; body: any; headers: Record<string, string> }[] = [];
  const f = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)), headers: init.headers as Record<string, string> });
    return new Response(JSON.stringify({ accepted: 1, rejected: 0, errors: [] }), { status });
  }) as unknown as typeof fetch;
  return { f, calls };
}
const mk = (f: typeof fetch, extra = {}) => new Regressa({ apiKey: "rgsa_test_abc", baseUrl: "http://ingest.local", fetch: f, flushAt: 10, flushIntervalMs: 60_000, ...extra });

describe("Regressa client", () => {
  it("buffers and flushes traces with the project key header", async () => {
    const { f, calls } = fakeFetch();
    const r = mk(f);
    r.trace({ model: "gpt-4o-mini", provider: "openai", input_messages: [{ role: "user", content: "hi" }], output_text: "hello" });
    await r.flush();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("http://ingest.local/v1/traces");
    expect(calls[0]!.headers["X-Regressa-Project-Key"]).toBe("rgsa_test_abc");
    expect(calls[0]!.body.traces[0].id).toMatch(/[0-9a-f-]{36}/);
    expect(calls[0]!.body.sdk.name).toBe("@regressa/node");
  });
  it("flushes automatically at flushAt", async () => {
    const { f, calls } = fakeFetch();
    const r = mk(f, { flushAt: 2 });
    r.trace({ model: "m", provider: "other", input_messages: [{ role: "user", content: "1" }] });
    r.trace({ model: "m", provider: "other", input_messages: [{ role: "user", content: "2" }] });
    await r.flush();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.body.traces).toHaveLength(2);
  });
  it("applies redaction and default metadata", async () => {
    const { f, calls } = fakeFetch();
    const r = mk(f, { redact: (m: any[]) => m.map((x) => ({ ...x, content: "[redacted]" })), defaultMetadata: { env: "test" } });
    r.trace({ model: "m", provider: "other", input_messages: [{ role: "user", content: "secret" }], metadata: { user: "u1" } });
    await r.flush();
    const t = calls[0]!.body.traces[0];
    expect(t.input_messages[0].content).toBe("[redacted]");
    expect(t.metadata).toEqual({ env: "test", user: "u1" });
  });
  it("is a no-op when disabled", async () => {
    const { f, calls } = fakeFetch();
    const r = mk(f, { disabled: true });
    r.trace({ model: "m", provider: "other", input_messages: [] });
    await r.flush();
    expect(calls).toHaveLength(0);
  });
  it("retries on 5xx and then reports once via onError", async () => {
    const onError = vi.fn();
    const { f, calls } = fakeFetch(503);
    const r = mk(f, { onError });
    r.trace({ model: "m", provider: "other", input_messages: [] });
    await r.flush();
    expect(calls.length).toBe(4); // 1 + 3 retries
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

describe("wrapOpenAI", () => {
  it("records usage, latency and the declared template, and strips the regressa option", async () => {
    const { f, calls } = fakeFetch();
    const r = mk(f);
    const seen: any[] = [];
    const fake = { chat: { completions: { create: async (p: any) => { seen.push(p); return { model: p.model, choices: [{ message: { content: "pong" } }], usage: { prompt_tokens: 5, completion_tokens: 1 } }; } } } };
    const client = wrapOpenAI(fake, r);
    const res = await client.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "system", content: "You are a ping bot." }, { role: "user", content: "ping" }], regressa: { promptTemplate: { name: "ping", raw: "You are a ping bot." }, traceGroupId: "g1" } } as any);
    expect(res.choices[0].message.content).toBe("pong");
    expect(seen[0].regressa).toBeUndefined();
    await r.flush();
    const t = calls[0]!.body.traces[0];
    expect(t).toMatchObject({ output_text: "pong", prompt_tokens: 5, completion_tokens: 1, status: "success", provider: "openai", trace_group_id: "g1" });
    expect(t.prompt_template.name).toBe("ping");
    expect(typeof t.latency_ms).toBe("number");
  });
  it("records errors and rethrows", async () => {
    const { f, calls } = fakeFetch();
    const r = mk(f);
    const fake = { chat: { completions: { create: async () => { throw new Error("429 rate limit"); } } } };
    const client = wrapOpenAI(fake, r);
    await expect(client.chat.completions.create({ model: "gpt-4o", messages: [{ role: "user", content: "x" }] } as any)).rejects.toThrow("429");
    await r.flush();
    expect(calls[0]!.body.traces[0]).toMatchObject({ status: "error", error_message: "429 rate limit" });
  });
  it("assembles streamed chunks into one trace", async () => {
    const { f, calls } = fakeFetch();
    const r = mk(f);
    const chunks = [{ model: "gpt-4o-mini", choices: [{ delta: { content: "Hel" } }] }, { choices: [{ delta: { content: "lo" } }], usage: { prompt_tokens: 3, completion_tokens: 2 } }];
    const stream = { async *[Symbol.asyncIterator]() { for (const c of chunks) yield c; } };
    const fake = { chat: { completions: { create: async () => stream } } };
    const client = wrapOpenAI(fake, r);
    const s = await client.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: "hi" }], stream: true } as any);
    const got: any[] = [];
    for await (const c of s) got.push(c);
    expect(got).toHaveLength(2);
    await r.flush();
    expect(calls[0]!.body.traces[0]).toMatchObject({ output_text: "Hello", prompt_tokens: 3, completion_tokens: 2, status: "success" });
  });
});

describe("wrapAnthropic", () => {
  it("folds the system prompt into input_messages and reads text blocks", async () => {
    const { f, calls } = fakeFetch();
    const r = mk(f);
    const fake = { messages: { create: async (p: any) => ({ model: p.model, content: [{ type: "text", text: "Hi " }, { type: "text", text: "there" }], usage: { input_tokens: 7, output_tokens: 2 } }) } };
    const client = wrapAnthropic(fake, r);
    await client.messages.create({ model: "claude-sonnet-5", system: "Be brief.", messages: [{ role: "user", content: "hello" }] } as any);
    await r.flush();
    const t = calls[0]!.body.traces[0];
    expect(t.input_messages[0]).toEqual({ role: "system", content: "Be brief." });
    expect(t).toMatchObject({ output_text: "Hi there", prompt_tokens: 7, completion_tokens: 2, provider: "anthropic" });
    expect(t.prompt_template.raw).toBe("Be brief.");
  });
  it("collects streamed text deltas and usage", async () => {
    const { f, calls } = fakeFetch();
    const r = mk(f);
    const events = [
      { type: "message_start", message: { model: "claude-sonnet-5", usage: { input_tokens: 4 } } },
      { type: "content_block_delta", delta: { type: "text_delta", text: "Yo" } },
      { type: "content_block_delta", delta: { type: "text_delta", text: "!" } },
      { type: "message_delta", usage: { output_tokens: 1 } },
    ];
    const stream = { async *[Symbol.asyncIterator]() { for (const e of events) yield e; } };
    const client = wrapAnthropic({ messages: { create: async () => stream } }, r);
    const s = await client.messages.create({ model: "claude-sonnet-5", messages: [{ role: "user", content: "x" }], stream: true } as any);
    for await (const _ of s) { /* drain */ }
    await r.flush();
    expect(calls[0]!.body.traces[0]).toMatchObject({ output_text: "Yo!", prompt_tokens: 4, completion_tokens: 1 });
  });
});

describe("inferTemplate", () => {
  it("uses the system message as the template with a stable hashed name", () => {
    const a = inferTemplate([{ role: "system", content: "You are X." }, { role: "user", content: "hi" }]);
    const b = inferTemplate([], "You are X.");
    expect(a).toEqual(b);
    expect(a?.name).toMatch(/^system:[0-9a-f]{8}$/);
    expect(inferTemplate([{ role: "user", content: "hi" }])).toBeUndefined();
  });
  it("flattens content blocks", () => {
    expect(inferTemplate([{ role: "system", content: [{ type: "text", text: "A" }, { type: "text", text: "B" }] }])?.raw).toBe("AB");
  });
});
