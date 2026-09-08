import type { GateResult, GateSide } from "@regressa/shared-types";

export interface GateOptions {
  /** Fail if candidate avg eval score is below this absolute value. */
  minScore?: number;
  /** Fail if candidate avg eval score is more than this percent below baseline. Default 10. */
  maxDropPct?: number;
  /** Fail if candidate error rate exceeds this fraction. Default 0.05. */
  maxErrorRate?: number;
  /** Fail if candidate p95 latency is more than this percent above baseline. Default 50. */
  maxLatencyIncreasePct?: number;
  /** Fail if candidate avg cost is more than this percent above baseline. Default 50. */
  maxCostIncreasePct?: number;
  /** Wait for at least this many eval results before deciding. Default 1. */
  expectEvals?: number;
}

const pct = (cur: number, base: number) => (base === 0 ? 0 : ((cur - base) / base) * 100);

/**
 * Pure verdict logic for the CI regression gate. Returns "pending" while evals are still being scored,
 * so a CLI can poll; "fail" as soon as any check fails; "pass" otherwise.
 */
export function decideGate(template: string, run: string | null, candidate: GateSide, baseline: GateSide, opts: GateOptions = {}): GateResult {
  // Only defined options override defaults; query params that are absent arrive as undefined.
  const defined = Object.fromEntries(Object.entries(opts).filter(([, v]) => v !== undefined && !Number.isNaN(v as number))) as GateOptions;
  const o = { maxDropPct: 10, maxErrorRate: 0.05, maxLatencyIncreasePct: 50, maxCostIncreasePct: 50, expectEvals: 1, ...defined };
  const checks: GateResult["checks"] = [];

  if (candidate.request_count === 0) {
    return { template, run, candidate, baseline, checks, status: "pending", pending_reason: "no candidate traces yet" };
  }

  checks.push({ name: "error_rate", ok: candidate.error_rate <= o.maxErrorRate, detail: `${(candidate.error_rate * 100).toFixed(1)}% (max ${(o.maxErrorRate * 100).toFixed(1)}%)` });

  if (baseline.request_count > 0 && baseline.p95_latency_ms > 0) {
    const d = pct(candidate.p95_latency_ms, baseline.p95_latency_ms);
    checks.push({ name: "latency_p95", ok: d <= o.maxLatencyIncreasePct, detail: `${Math.round(candidate.p95_latency_ms)}ms vs ${Math.round(baseline.p95_latency_ms)}ms (${d >= 0 ? "+" : ""}${d.toFixed(0)}%, max +${o.maxLatencyIncreasePct}%)` });
  }
  if (baseline.request_count > 0 && baseline.avg_cost_usd > 0) {
    const d = pct(candidate.avg_cost_usd, baseline.avg_cost_usd);
    checks.push({ name: "cost_per_request", ok: d <= o.maxCostIncreasePct, detail: `$${candidate.avg_cost_usd.toFixed(5)} vs $${baseline.avg_cost_usd.toFixed(5)} (${d >= 0 ? "+" : ""}${d.toFixed(0)}%, max +${o.maxCostIncreasePct}%)` });
  }

  const needEvals = o.minScore != null || baseline.avg_eval_score != null;
  if (needEvals && candidate.eval_count < o.expectEvals) {
    // Fail fast on hard errors even while evals are pending.
    if (checks.some((c) => !c.ok)) return { template, run, candidate, baseline, checks, status: "fail" };
    return { template, run, candidate, baseline, checks, status: "pending", pending_reason: `${candidate.eval_count}/${o.expectEvals} eval results scored` };
  }
  if (candidate.avg_eval_score != null) {
    if (o.minScore != null) checks.push({ name: "min_eval_score", ok: candidate.avg_eval_score >= o.minScore, detail: `${candidate.avg_eval_score.toFixed(3)} (min ${o.minScore})` });
    if (baseline.avg_eval_score != null && baseline.avg_eval_score > 0) {
      const d = pct(candidate.avg_eval_score, baseline.avg_eval_score);
      checks.push({ name: "eval_score_vs_baseline", ok: d >= -o.maxDropPct, detail: `${candidate.avg_eval_score.toFixed(3)} vs ${baseline.avg_eval_score.toFixed(3)} (${d >= 0 ? "+" : ""}${d.toFixed(1)}%, max -${o.maxDropPct}%)` });
    }
  }

  return { template, run, candidate, baseline, checks, status: checks.every((c) => c.ok) ? "pass" : "fail" };
}

export function parseGateOptions(params: URLSearchParams): GateOptions {
  const num = (k: string) => { const v = params.get(k); return v == null || v === "" ? undefined : Number(v); };
  return {
    minScore: num("min_score"), maxDropPct: num("max_drop_pct"), maxErrorRate: num("max_error_rate"),
    maxLatencyIncreasePct: num("max_latency_increase_pct"), maxCostIncreasePct: num("max_cost_increase_pct"), expectEvals: num("expect_evals"),
  };
}
