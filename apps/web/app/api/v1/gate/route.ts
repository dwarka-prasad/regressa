import { NextResponse, type NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import type { GateSide } from "@regressa/shared-types";
import { apiAuth } from "@/lib/apiAuth";
import { db } from "@/lib/db";
import { decideGate, parseGateOptions } from "@/lib/gate";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/gate?template=<name>&run=<ci run id>&baseline_days=7&min_score=&max_drop_pct=&expect_evals=
 *
 * Candidate = traces for `template` tagged metadata.regressa_run = run (sent by the SDK from CI).
 * Baseline  = traces for the same template over the last baseline_days, excluding that run.
 * Returns pass | fail | pending so a CLI can poll until evals are scored.
 */
export async function GET(req: NextRequest) {
  const ctx = await apiAuth(req);
  if (ctx instanceof NextResponse) return ctx;
  const q = req.nextUrl.searchParams;
  const template = q.get("template");
  const run = q.get("run");
  if (!template) return NextResponse.json({ error: "template is required" }, { status: 400 });
  const baselineDays = Math.min(90, Math.max(1, Number(q.get("baseline_days") ?? 7)));

  const [candidate, baseline] = await Promise.all([
    sideStats(ctx.projectId, template, run, "candidate", baselineDays),
    sideStats(ctx.projectId, template, run, "baseline", baselineDays),
  ]);
  return NextResponse.json(decideGate(template, run, candidate, baseline, parseGateOptions(q)));
}

async function sideStats(projectId: string, template: string, run: string | null, side: "candidate" | "baseline", days: number): Promise<GateSide> {
  // Candidate without a run id is empty by definition; baseline excludes the run and is bounded by the window.
  const filter = side === "candidate"
    ? (run ? sql`AND t.metadata->>'regressa_run' = ${run}` : sql`AND false`)
    : sql`AND coalesce(t.metadata->>'regressa_run', '') <> ${run ?? ""} AND t.created_at >= now() - make_interval(days => ${days})`;

  const rows = (await db().execute(sql`
    WITH tr AS (
      SELECT t.id, t.status, t.latency_ms, t.total_cost_usd, pv.version_number
      FROM regressa.traces t
      JOIN regressa.prompt_versions pv ON pv.id = t.prompt_version_id
      JOIN regressa.prompt_templates pt ON pt.id = pv.prompt_template_id
      WHERE pt.project_id = ${projectId} AND pt.name = ${template} ${filter}
    ), ev AS (
      SELECT er.score, er.passed FROM regressa.eval_results er WHERE er.trace_id IN (SELECT id FROM tr)
    )
    SELECT (SELECT count(*)::int FROM tr) AS request_count,
           (SELECT coalesce(percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms), 0)::float8 FROM tr) AS p95_latency_ms,
           (SELECT CASE WHEN count(*) = 0 THEN 0 ELSE (count(*) FILTER (WHERE status != 'success'))::float8 / count(*) END FROM tr) AS error_rate,
           (SELECT coalesce(avg(total_cost_usd), 0)::float8 FROM tr) AS avg_cost_usd,
           (SELECT max(version_number)::int FROM tr) AS version_number,
           (SELECT count(*)::int FROM ev) AS eval_count,
           (SELECT avg(score)::float8 FROM ev) AS avg_eval_score,
           (SELECT avg(CASE WHEN passed THEN 1 ELSE 0 END)::float8 FROM ev) AS pass_rate
  `)) as unknown as Record<string, number | null>[];
  const r = rows[0] ?? {};
  return {
    request_count: Number(r.request_count ?? 0), eval_count: Number(r.eval_count ?? 0),
    avg_eval_score: r.avg_eval_score == null ? null : Number(r.avg_eval_score), pass_rate: r.pass_rate == null ? null : Number(r.pass_rate),
    p95_latency_ms: Number(r.p95_latency_ms ?? 0), error_rate: Number(r.error_rate ?? 0), avg_cost_usd: Number(r.avg_cost_usd ?? 0),
    version_number: r.version_number == null ? null : Number(r.version_number),
  };
}
