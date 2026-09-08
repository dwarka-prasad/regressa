import { sql } from "drizzle-orm";
import type { RegressaDb } from "@regressa/db";

export interface WindowMetrics { cost: number; latency_p95: number; error_rate: number; request_count: number }

/** Compute metrics for a project over [now - (minutes + endOffset), now - endOffset). Optional prompt template scope. */
export async function windowMetrics(
  db: RegressaDb, projectId: string, minutes: number, endOffsetMinutes = 0, promptTemplateId?: string | null,
): Promise<WindowMetrics> {
  const rows = await db.execute(sql`
    SELECT
      coalesce(sum(t.total_cost_usd), 0)::float8                                            AS cost,
      coalesce(percentile_cont(0.95) WITHIN GROUP (ORDER BY t.latency_ms), 0)::float8       AS latency_p95,
      CASE WHEN count(*) = 0 THEN 0 ELSE (count(*) FILTER (WHERE t.status != 'success'))::float8 / count(*) END AS error_rate,
      count(*)::int                                                                          AS request_count
    FROM regressa.traces t
    LEFT JOIN regressa.prompt_versions pv ON pv.id = t.prompt_version_id
    WHERE t.project_id = ${projectId}
      AND t.created_at >= now() - make_interval(mins => ${minutes + endOffsetMinutes})
      AND t.created_at <  now() - make_interval(mins => ${endOffsetMinutes})
      ${promptTemplateId ? sql`AND pv.prompt_template_id = ${promptTemplateId}` : sql``}
  `);
  const r = (rows as unknown as WindowMetrics[])[0]!;
  return { cost: Number(r.cost), latency_p95: Number(r.latency_p95), error_rate: Number(r.error_rate), request_count: Number(r.request_count) };
}

export async function windowEvalScore(
  db: RegressaDb, projectId: string, evalDefinitionId: string | null, minutes: number, endOffsetMinutes = 0,
): Promise<{ avg: number; count: number }> {
  const rows = await db.execute(sql`
    SELECT coalesce(avg(score), 0)::float8 AS avg, count(*)::int AS count
    FROM regressa.eval_results
    WHERE project_id = ${projectId}
      ${evalDefinitionId ? sql`AND eval_definition_id = ${evalDefinitionId}` : sql``}
      AND created_at >= now() - make_interval(mins => ${minutes + endOffsetMinutes})
      AND created_at <  now() - make_interval(mins => ${endOffsetMinutes})
  `);
  const r = (rows as unknown as { avg: number; count: number }[])[0]!;
  return { avg: Number(r.avg), count: Number(r.count) };
}

/** Values of a metric for the last `windows` consecutive windows (oldest first), excluding the current one. */
export async function windowHistory(db: RegressaDb, rule: { projectId: string; metric: string; windowMinutes: number; promptTemplateId: string | null; evalDefinitionId: string | null }, windows = 24): Promise<number[]> {
  const out: number[] = [];
  for (let i = windows; i >= 1; i--) {
    if (rule.metric === "eval_score") {
      const r = await windowEvalScore(db, rule.projectId, rule.evalDefinitionId, rule.windowMinutes, rule.windowMinutes * i);
      if (r.count > 0) out.push(r.avg);
    } else {
      const mtr = await windowMetrics(db, rule.projectId, rule.windowMinutes, rule.windowMinutes * i, rule.promptTemplateId);
      if (mtr.request_count > 0) out.push(rule.metric === "cost" ? mtr.cost : rule.metric === "latency_p95" ? mtr.latency_p95 : mtr.error_rate);
    }
  }
  return out;
}

/** Spend this calendar month for a project. */
export async function monthlySpend(db: RegressaDb, projectId: string): Promise<number> {
  const rows = await db.execute(sql`SELECT coalesce(sum(total_cost_usd), 0)::float8 AS spend FROM regressa.traces WHERE project_id = ${projectId} AND created_at >= date_trunc('month', now())`);
  return Number((rows as unknown as { spend: number }[])[0]?.spend ?? 0);
}
