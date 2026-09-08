import { describe, expect, it } from "vitest";
import { IngestBatchSchema, TraceInputSchema, estimateCostUsd, normalizeTemplate, planLimits } from "./index.js";

describe("TraceInputSchema", () => {
  const ok = { model: "gpt-4o-mini", provider: "openai", input_messages: [{ role: "user", content: "hi" }] };
  it("applies defaults", () => {
    const t = TraceInputSchema.parse(ok);
    expect(t.status).toBe("success");
    expect(t.metadata).toEqual({});
  });
  it("rejects unknown providers, empty messages, negative tokens and bad uuids", () => {
    expect(TraceInputSchema.safeParse({ ...ok, provider: "gemini" }).success).toBe(false);
    expect(TraceInputSchema.safeParse({ ...ok, input_messages: [] }).success).toBe(false);
    expect(TraceInputSchema.safeParse({ ...ok, prompt_tokens: -1 }).success).toBe(false);
    expect(TraceInputSchema.safeParse({ ...ok, id: "not-a-uuid" }).success).toBe(false);
  });
  it("accepts content blocks as message content", () => {
    expect(TraceInputSchema.safeParse({ ...ok, input_messages: [{ role: "user", content: [{ type: "text", text: "x" }] }] }).success).toBe(true);
  });
  it("caps batches at 1000", () => {
    expect(IngestBatchSchema.safeParse({ traces: Array.from({ length: 1001 }, () => ok) }).success).toBe(false);
    expect(IngestBatchSchema.safeParse({ traces: [] }).success).toBe(false);
  });
});

describe("estimateCostUsd", () => {
  it("prices known models per million tokens", () => {
    expect(estimateCostUsd("gpt-4o-mini", 1_000_000, 0)).toBeCloseTo(0.15);
    expect(estimateCostUsd("claude-sonnet-5", 0, 1_000_000)).toBeCloseTo(15);
  });
  it("matches dated model variants by the longest prefix", () => {
    expect(estimateCostUsd("gpt-4o-2024-08-06", 1_000_000, 0)).toBeCloseTo(2.5);
    expect(estimateCostUsd("gpt-4o-mini-2024-07-18", 1_000_000, 0)).toBeCloseTo(0.15);
  });
  it("returns null for unknown models or when no token counts exist", () => {
    expect(estimateCostUsd("llama-3", 10, 10)).toBeNull();
    expect(estimateCostUsd("gpt-4o-mini")).toBeNull();
    expect(estimateCostUsd("gpt-4o-mini", undefined, 10)).not.toBeNull();
  });
});

describe("normalizeTemplate", () => {
  it("ignores trailing whitespace, CRLF and outer blank lines so cosmetic edits do not create versions", () => {
    expect(normalizeTemplate("Hello {{name}}  \r\nBye\r\n")).toBe("Hello {{name}}\nBye");
    expect(normalizeTemplate("\n\nA\n")).toBe("A");
  });
  it("keeps meaningful changes distinct", () => {
    expect(normalizeTemplate("Be concise.")).not.toBe(normalizeTemplate("Be concise and warm."));
  });
});

describe("planLimits", () => {
  it("falls back to free for unknown plans", () => {
    expect(planLimits("free").tracesPerMonth).toBe(10_000);
    expect(planLimits("mystery")).toEqual(planLimits("free"));
    expect(planLimits("enterprise").tracesPerMonth).toBe(Number.POSITIVE_INFINITY);
  });
});
