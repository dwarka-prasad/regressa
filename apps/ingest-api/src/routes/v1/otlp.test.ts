import { describe, expect, it } from "vitest";
import { otlpToTraces } from "./otlp.js";

const kv = (key: string, value: unknown) => ({ key, value: typeof value === "number" ? { intValue: value } : { stringValue: String(value) } });

describe("otlpToTraces", () => {
  it("maps a GenAI span with events onto a trace", () => {
    const traces = otlpToTraces({
      resourceSpans: [{
        resource: { attributes: [kv("service.name", "checkout-api")] },
        scopeSpans: [{ spans: [{
          traceId: "abc", spanId: "def", name: "chat gpt-4o-mini",
          startTimeUnixNano: "1700000000000000000", endTimeUnixNano: "1700000000450000000",
          attributes: [kv("gen_ai.system", "openai"), kv("gen_ai.request.model", "gpt-4o-mini"), kv("gen_ai.usage.input_tokens", 12), kv("gen_ai.usage.output_tokens", 3),
            kv("regressa.prompt_template.name", "greeting"), kv("regressa.prompt_template.raw", "Say hi to {{name}}"), kv("regressa.meta.tenant", "acme")],
          events: [
            { name: "gen_ai.system.message", attributes: [kv("content", "Say hi to Ada")] },
            { name: "gen_ai.user.message", attributes: [kv("content", "hello")] },
            { name: "gen_ai.choice", attributes: [kv("message", JSON.stringify({ role: "assistant", content: "Hi Ada!" }))] },
          ],
        }] }],
      }],
    });
    expect(traces).toHaveLength(1);
    const t = traces[0]!;
    expect(t).toMatchObject({ model: "gpt-4o-mini", provider: "openai", prompt_tokens: 12, completion_tokens: 3, latency_ms: 450, status: "success", output_text: "Hi Ada!", trace_group_id: "abc" });
    expect(t.input_messages).toEqual([{ role: "system", content: "Say hi to Ada" }, { role: "user", content: "hello" }]);
    expect(t.prompt_template).toEqual({ name: "greeting", raw: "Say hi to {{name}}" });
    expect(t.metadata).toMatchObject({ tenant: "acme", otel: { service: "checkout-api", span_name: "chat gpt-4o-mini" } });
    expect(t.timestamp).toBe("2023-11-14T22:13:20.000Z");
  });
  it("ignores spans without a model and marks error statuses", () => {
    const traces = otlpToTraces({ resourceSpans: [{ scopeSpans: [{ spans: [
      { name: "db.query", attributes: [kv("db.system", "postgres")] },
      { name: "chat", attributes: [kv("gen_ai.request.model", "claude-sonnet-5"), kv("gen_ai.system", "anthropic"), kv("gen_ai.prompt", JSON.stringify([{ role: "user", content: "x" }]))], status: { code: 2, message: "rate limited" } },
    ] }] }] });
    expect(traces).toHaveLength(1);
    expect(traces[0]).toMatchObject({ provider: "anthropic", status: "error", error_message: "rate limited" });
    expect(traces[0]!.input_messages).toEqual([{ role: "user", content: "x" }]);
  });
  it("returns an empty list for an empty payload", () => {
    expect(otlpToTraces({})).toEqual([]);
  });
});
