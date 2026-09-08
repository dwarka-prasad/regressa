import { describe, expect, it } from "vitest";
import { decideGate, parseGateOptions } from "../gate";
import type { GateSide } from "@regressa/shared-types";

const side = (over: Partial<GateSide> = {}): GateSide => ({ request_count: 20, eval_count: 20, avg_eval_score: 0.85, pass_rate: 0.9, p95_latency_ms: 800, error_rate: 0.01, avg_cost_usd: 0.001, version_number: 3, ...over });

describe("decideGate", () => {
  it("is pending until candidate traces exist", () => {
    expect(decideGate("t", "r", side({ request_count: 0, eval_count: 0 }), side()).status).toBe("pending");
  });
  it("is pending while evals are still being scored, unless a hard check already failed", () => {
    expect(decideGate("t", "r", side({ eval_count: 0, avg_eval_score: null }), side(), { expectEvals: 5 })).toMatchObject({ status: "pending", pending_reason: "0/5 eval results scored" });
    expect(decideGate("t", "r", side({ eval_count: 0, avg_eval_score: null, error_rate: 0.5 }), side(), { expectEvals: 5 }).status).toBe("fail");
  });
  it("passes when everything is within tolerance", () => {
    const r = decideGate("t", "r", side({ avg_eval_score: 0.84, p95_latency_ms: 900 }), side());
    expect(r.status).toBe("pass");
    expect(r.checks.map((c) => c.name)).toEqual(["error_rate", "latency_p95", "cost_per_request", "eval_score_vs_baseline"]);
  });
  it("fails on an eval score drop beyond max_drop_pct", () => {
    const r = decideGate("t", "r", side({ avg_eval_score: 0.7 }), side({ avg_eval_score: 0.85 }), { maxDropPct: 10 });
    expect(r.status).toBe("fail");
    expect(r.checks.find((c) => c.name === "eval_score_vs_baseline")).toMatchObject({ ok: false });
  });
  it("fails on the absolute minimum score and on latency or cost regressions", () => {
    expect(decideGate("t", "r", side({ avg_eval_score: 0.6 }), side({ avg_eval_score: null }), { minScore: 0.7 }).status).toBe("fail");
    expect(decideGate("t", "r", side({ p95_latency_ms: 2000 }), side({ p95_latency_ms: 800 })).status).toBe("fail");
    expect(decideGate("t", "r", side({ avg_cost_usd: 0.01 }), side({ avg_cost_usd: 0.001 })).status).toBe("fail");
  });
  it("skips baseline comparisons when there is no baseline traffic", () => {
    const r = decideGate("t", null, side(), side({ request_count: 0, eval_count: 0, avg_eval_score: null, p95_latency_ms: 0, avg_cost_usd: 0 }), { minScore: 0.7 });
    expect(r.status).toBe("pass");
    expect(r.checks.map((c) => c.name)).toEqual(["error_rate", "min_eval_score"]);
  });
});

describe("decideGate with options parsed from a sparse query string", () => {
  it("keeps defaults when params are absent (regression: undefined used to override them)", () => {
    const r = decideGate("t", "r", side({ avg_eval_score: null, eval_count: 0 }), side({ avg_eval_score: null, eval_count: 0 }), parseGateOptions(new URLSearchParams("template=t&run=r")));
    expect(r.status).toBe("pass");
    expect(r.checks.find((c) => c.name === "error_rate")?.detail).toBe("1.0% (max 5.0%)");
    expect(r.checks.find((c) => c.name === "cost_per_request")?.detail).toContain("max +50%");
  });
});

describe("parseGateOptions", () => {
  it("reads numeric query params and leaves others undefined", () => {
    const o = parseGateOptions(new URLSearchParams("min_score=0.7&max_drop_pct=5&expect_evals=10"));
    expect(o).toMatchObject({ minScore: 0.7, maxDropPct: 5, expectEvals: 10 });
    expect(o.maxErrorRate).toBeUndefined();
  });
});
