import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../queues.js", () => ({ notifyQueue: { add: vi.fn() }, connection: {}, tracesQueue: {}, evalsQueue: {}, alertsQueue: {} }));
vi.mock("./metrics.js", () => ({ windowMetrics: vi.fn(), windowEvalScore: vi.fn(), windowHistory: vi.fn(), monthlySpend: vi.fn() }));

import { checkRule } from "./evaluate.js";
import { windowEvalScore, windowHistory, windowMetrics } from "./metrics.js";

const rule = (over: Partial<Record<string, unknown>> = {}) => ({
  id: "r1", projectId: "p1", name: "test", metric: "error_rate", condition: "gt", threshold: "0.05", windowMinutes: 60,
  promptTemplateId: null, evalDefinitionId: null, channel: "webhook", channelConfig: {}, cooldownMinutes: 60, isActive: true, lastTriggeredAt: null, createdAt: new Date(), ...over,
}) as any;
const metrics = (cur: Partial<{ cost: number; latency_p95: number; error_rate: number; request_count: number }>, prev = cur) => {
  vi.mocked(windowMetrics).mockImplementation(async (_db, _p, _m, endOffset) => ({ cost: 0, latency_p95: 0, error_rate: 0, request_count: 100, ...(endOffset ? prev : cur) }));
};
const db = {} as any;

describe("checkRule", () => {
  beforeEach(() => { vi.mocked(windowMetrics).mockReset(); vi.mocked(windowEvalScore).mockReset(); });

  it("gt fires when above threshold with a formatted message", async () => {
    metrics({ error_rate: 0.12, request_count: 100 });
    const r = await checkRule(db, rule());
    expect(r?.current).toBeCloseTo(0.12);
    expect(r?.message).toContain("Error rate is 12.00% over the last 60m");
  });
  it("gt stays quiet under threshold or with too few samples", async () => {
    metrics({ error_rate: 0.01, request_count: 100 });
    expect(await checkRule(db, rule())).toBeNull();
    metrics({ error_rate: 0.9, request_count: 5 }); // error_rate needs 20 samples
    expect(await checkRule(db, rule())).toBeNull();
  });
  it("lt fires when below threshold", async () => {
    metrics({ latency_p95: 120, request_count: 10 });
    const r = await checkRule(db, rule({ metric: "latency_p95", condition: "lt", threshold: "200" }));
    expect(r?.message).toContain("p95 latency dropped to 120ms");
  });
  it("pct_change compares against the preceding window and treats rises as regressions for cost", async () => {
    metrics({ cost: 2.0, request_count: 10 }, { cost: 1.0, request_count: 10 });
    const r = await checkRule(db, rule({ metric: "cost", condition: "pct_change", threshold: "50" }));
    expect(r).toMatchObject({ current: 2, baseline: 1 });
    expect(r?.message).toContain("+100.0%".replace("+", ""));
    metrics({ cost: 1.2, request_count: 10 }, { cost: 1.0, request_count: 10 });
    expect(await checkRule(db, rule({ metric: "cost", condition: "pct_change", threshold: "50" }))).toBeNull();
  });
  it("pct_change treats drops as regressions for eval_score and needs 5 samples", async () => {
    vi.mocked(windowEvalScore).mockImplementation(async (_db, _p, _d, _m, endOffset) => (endOffset ? { avg: 0.9, count: 20 } : { avg: 0.7, count: 20 }));
    const r = await checkRule(db, rule({ metric: "eval_score", condition: "pct_change", threshold: "10" }));
    expect(r?.baseline).toBeCloseTo(0.9);
    expect(r?.message).toMatch(/Eval score changed -22\.2%/);
    vi.mocked(windowEvalScore).mockImplementation(async (_db, _p, _d, _m, endOffset) => (endOffset ? { avg: 0.9, count: 20 } : { avg: 0.5, count: 3 }));
    expect(await checkRule(db, rule({ metric: "eval_score", condition: "pct_change", threshold: "10" }))).toBeNull();
  });
  it("pct_change skips when the baseline is zero", async () => {
    metrics({ cost: 5, request_count: 10 }, { cost: 0, request_count: 10 });
    expect(await checkRule(db, rule({ metric: "cost", condition: "pct_change", threshold: "10" }))).toBeNull();
  });
  it("scopes eval_score to the rule's eval definition", async () => {
    vi.mocked(windowEvalScore).mockResolvedValue({ avg: 0.4, count: 10 });
    await checkRule(db, rule({ metric: "eval_score", condition: "lt", threshold: "0.5", evalDefinitionId: "e9" }));
    expect(vi.mocked(windowEvalScore).mock.calls[0]![2]).toBe("e9");
  });
});

describe("anomaly condition", () => {
  const flat = Array.from({ length: 24 }, (_, i) => 100 + (i % 7));
  it("fires when the current window is far outside the rolling baseline", async () => {
    vi.mocked(windowHistory).mockResolvedValue(flat);
    vi.mocked(windowMetrics).mockResolvedValue({ cost: 0, latency_p95: 400, error_rate: 0, request_count: 50 });
    const r = await checkRule(db, rule({ metric: "latency_p95", condition: "anomaly", threshold: "3" }));
    expect(r).not.toBeNull();
    expect(r?.message).toMatch(/standard deviations above its rolling baseline/);
  });
  it("stays quiet with a normal current value", async () => {
    vi.mocked(windowHistory).mockResolvedValue(flat);
    vi.mocked(windowMetrics).mockResolvedValue({ cost: 0, latency_p95: 104, error_rate: 0, request_count: 50 });
    expect(await checkRule(db, rule({ metric: "latency_p95", condition: "anomaly", threshold: "3" }))).toBeNull();
  });
  it("for eval_score only a drop is anomalous", async () => {
    vi.mocked(windowHistory).mockResolvedValue(Array.from({ length: 24 }, (_, i) => 0.9 + (i % 3) * 0.01));
    vi.mocked(windowEvalScore).mockResolvedValue({ avg: 0.99, count: 20 });
    expect(await checkRule(db, rule({ metric: "eval_score", condition: "anomaly", threshold: "3" }))).toBeNull();
    vi.mocked(windowEvalScore).mockResolvedValue({ avg: 0.5, count: 20 });
    expect(await checkRule(db, rule({ metric: "eval_score", condition: "anomaly", threshold: "3" }))).not.toBeNull();
  });
});
