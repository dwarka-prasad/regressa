import { describe, expect, it, vi } from "vitest";
vi.mock("../queues.js", () => ({ notifyQueue: { add: vi.fn() }, evalsQueue: { addBulk: vi.fn() }, connection: {}, tracesQueue: {}, alertsQueue: {} }));
import { toRow } from "./tracesWorker.js";

describe("toRow", () => {
  const base = { model: "gpt-4o-mini", provider: "openai" as const, input_messages: [{ role: "user", content: "hi" }], status: "success" as const, metadata: {} };
  it("estimates cost from tokens when not provided", () => {
    const row = toRow("p1", { ...base, prompt_tokens: 1000, completion_tokens: 1000 }, "v1");
    expect(row.totalCostUsd).toBe((0.15 / 1000 + 0.6 / 1000).toFixed(6));
    expect(row.promptVersionId).toBe("v1");
    expect(row.projectId).toBe("p1");
  });
  it("leaves cost null when there are no token counts and no explicit cost", () => {
    expect(toRow("p1", { ...base, status: "error", error_message: "boom" }).totalCostUsd).toBeNull();
  });
  it("prefers an explicit cost and the client timestamp", () => {
    const row = toRow("p1", { ...base, total_cost_usd: 0.5, timestamp: "2026-01-01T00:00:00.000Z", id: "11111111-1111-4111-8111-111111111111" });
    expect(row.totalCostUsd).toBe("0.500000");
    expect(row.createdAt.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(row.id).toBe("11111111-1111-4111-8111-111111111111");
  });
});
