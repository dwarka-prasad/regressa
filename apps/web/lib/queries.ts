import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "./db";

export interface Bucket { bucket: string; request_count: number; total_cost: number; avg_latency_ms: number; p95_latency_ms: number; error_count: number; avg_eval_score: number | null }

/** Bucketed series for the last `hours` hours, straight from the hypertables (always fresh). Empty buckets are filled. */
export async function series(projectId: string, hours: number, bucket: string): Promise<Bucket[]> {
  const rows = (await db().execute(sql`
    WITH b AS (
      SELECT generate_series(time_bucket(${bucket}::interval, now() - make_interval(hours => ${hours})), time_bucket(${bucket}::interval, now()), ${bucket}::interval) AS bucket
    ), t AS (
      SELECT time_bucket(${bucket}::interval, created_at) AS bucket,
             count(*)::int AS request_count,
             coalesce(sum(total_cost_usd), 0)::float8 AS total_cost,
             coalesce(avg(latency_ms), 0)::float8 AS avg_latency_ms,
             coalesce(percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms), 0)::float8 AS p95_latency_ms,
             (count(*) FILTER (WHERE status != 'success'))::int AS error_count
      FROM regressa.traces WHERE project_id = ${projectId} AND created_at >= now() - make_interval(hours => ${hours})
      GROUP BY 1
    ), e AS (
      SELECT time_bucket(${bucket}::interval, created_at) AS bucket, avg(score)::float8 AS avg_eval_score
      FROM regressa.eval_results WHERE project_id = ${projectId} AND created_at >= now() - make_interval(hours => ${hours})
      GROUP BY 1
    )
    SELECT b.bucket, coalesce(t.request_count, 0) AS request_count, coalesce(t.total_cost, 0) AS total_cost,
           coalesce(t.avg_latency_ms, 0) AS avg_latency_ms, coalesce(t.p95_latency_ms, 0) AS p95_latency_ms,
           coalesce(t.error_count, 0) AS error_count, e.avg_eval_score
    FROM b LEFT JOIN t USING (bucket) LEFT JOIN e USING (bucket) ORDER BY b.bucket
  `)) as unknown as Bucket[];
  return rows.map((r) => ({ ...r, bucket: new Date(r.bucket).toISOString(), request_count: Number(r.request_count), total_cost: Number(r.total_cost), avg_latency_ms: Number(r.avg_latency_ms), p95_latency_ms: Number(r.p95_latency_ms), error_count: Number(r.error_count), avg_eval_score: r.avg_eval_score == null ? null : Number(r.avg_eval_score) }));
}

export interface Totals { request_count: number; total_cost: number; p95_latency_ms: number; error_rate: number; avg_eval_score: number | null; eval_count: number }

/** Totals for a window ending `offsetHours` ago (0 = now). Use offset = hours for the previous period. */
export async function totals(projectId: string, hours: number, offsetHours = 0): Promise<Totals> {
  const [t] = (await db().execute(sql`
    SELECT count(*)::int AS request_count,
           coalesce(sum(total_cost_usd), 0)::float8 AS total_cost,
           coalesce(percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms), 0)::float8 AS p95_latency_ms,
           CASE WHEN count(*) = 0 THEN 0 ELSE (count(*) FILTER (WHERE status != 'success'))::float8 / count(*) END AS error_rate
    FROM regressa.traces WHERE project_id = ${projectId}
      AND created_at >= now() - make_interval(hours => ${hours + offsetHours}) AND created_at < now() - make_interval(hours => ${offsetHours})
  `)) as unknown as Omit<Totals, "avg_eval_score" | "eval_count">[];
  const [e] = (await db().execute(sql`
    SELECT avg(score)::float8 AS avg_eval_score, count(*)::int AS eval_count FROM regressa.eval_results
    WHERE project_id = ${projectId}
      AND created_at >= now() - make_interval(hours => ${hours + offsetHours}) AND created_at < now() - make_interval(hours => ${offsetHours})
  `)) as unknown as { avg_eval_score: number | null; eval_count: number }[];
  return { request_count: Number(t!.request_count), total_cost: Number(t!.total_cost), p95_latency_ms: Number(t!.p95_latency_ms), error_rate: Number(t!.error_rate),
    avg_eval_score: e?.avg_eval_score == null ? null : Number(e.avg_eval_score), eval_count: Number(e?.eval_count ?? 0) };
}

export interface VersionStats {
  version_id: string; version_number: number; first_seen_at: string; request_count: number; total_cost: number;
  p95_latency_ms: number; error_rate: number; avg_eval_score: number | null; eval_count: number;
}

/** Per-version comparison for a prompt template: the regression view. */
export async function versionStats(templateId: string, days = 30): Promise<VersionStats[]> {
  const rows = await db().execute(sql`
    SELECT pv.id AS version_id, pv.version_number, pv.first_seen_at,
           count(t.id)::int AS request_count,
           coalesce(sum(t.total_cost_usd), 0)::float8 AS total_cost,
           coalesce(percentile_cont(0.95) WITHIN GROUP (ORDER BY t.latency_ms), 0)::float8 AS p95_latency_ms,
           CASE WHEN count(t.id) = 0 THEN 0 ELSE (count(t.id) FILTER (WHERE t.status != 'success'))::float8 / count(t.id) END AS error_rate,
           (SELECT avg(er.score)::float8 FROM regressa.eval_results er JOIN regressa.traces t2 ON t2.id = er.trace_id AND t2.created_at = er.trace_created_at WHERE t2.prompt_version_id = pv.id) AS avg_eval_score,
           (SELECT count(*)::int FROM regressa.eval_results er JOIN regressa.traces t2 ON t2.id = er.trace_id AND t2.created_at = er.trace_created_at WHERE t2.prompt_version_id = pv.id) AS eval_count
    FROM regressa.prompt_versions pv
    LEFT JOIN regressa.traces t ON t.prompt_version_id = pv.id AND t.created_at >= now() - make_interval(days => ${days})
    WHERE pv.prompt_template_id = ${templateId}
    GROUP BY pv.id ORDER BY pv.version_number DESC
  `);
  return (rows as unknown as VersionStats[]).map((r) => ({ ...r, avg_eval_score: r.avg_eval_score == null ? null : Number(r.avg_eval_score) }));
}

export async function costByModel(projectId: string, hours: number) {
  const rows = await db().execute(sql`
    SELECT model, provider, count(*)::int AS request_count, coalesce(sum(total_cost_usd), 0)::float8 AS total_cost,
           coalesce(sum(prompt_tokens), 0)::bigint AS prompt_tokens, coalesce(sum(completion_tokens), 0)::bigint AS completion_tokens,
           coalesce(avg(latency_ms), 0)::float8 AS avg_latency_ms
    FROM regressa.traces WHERE project_id = ${projectId} AND created_at >= now() - make_interval(hours => ${hours})
    GROUP BY model, provider ORDER BY total_cost DESC
  `);
  return rows as unknown as { model: string; provider: string; request_count: number; total_cost: number; prompt_tokens: string; completion_tokens: string; avg_latency_ms: number }[];
}

export async function costByTemplate(projectId: string, hours: number) {
  const rows = await db().execute(sql`
    SELECT coalesce(pt.name, '(untracked)') AS name, pt.id AS template_id, count(*)::int AS request_count, coalesce(sum(t.total_cost_usd), 0)::float8 AS total_cost
    FROM regressa.traces t
    LEFT JOIN regressa.prompt_versions pv ON pv.id = t.prompt_version_id
    LEFT JOIN regressa.prompt_templates pt ON pt.id = pv.prompt_template_id
    WHERE t.project_id = ${projectId} AND t.created_at >= now() - make_interval(hours => ${hours})
    GROUP BY pt.id, pt.name ORDER BY total_cost DESC
  `);
  return rows as unknown as { name: string; template_id: string | null; request_count: number; total_cost: number }[];
}

/** Recently detected prompt versions (the "what changed" feed). */
export async function recentVersionChanges(projectId: string, limit = 8) {
  return db().select({
    versionId: schema.promptVersions.id, versionNumber: schema.promptVersions.versionNumber, firstSeenAt: schema.promptVersions.firstSeenAt,
    templateId: schema.promptTemplates.id, templateName: schema.promptTemplates.name,
  }).from(schema.promptVersions)
    .innerJoin(schema.promptTemplates, eq(schema.promptTemplates.id, schema.promptVersions.promptTemplateId))
    .where(eq(schema.promptTemplates.projectId, projectId))
    .orderBy(desc(schema.promptVersions.firstSeenAt)).limit(limit);
}

export async function recentEvalResults(projectId: string, hours: number, limit = 30) {
  return db().select({ r: schema.evalResults, defName: schema.evalDefinitions.name, defType: schema.evalDefinitions.type, model: schema.traces.model, output: schema.traces.outputText })
    .from(schema.evalResults)
    .innerJoin(schema.evalDefinitions, eq(schema.evalDefinitions.id, schema.evalResults.evalDefinitionId))
    .innerJoin(schema.traces, and(eq(schema.traces.id, schema.evalResults.traceId), eq(schema.traces.createdAt, schema.evalResults.traceCreatedAt)))
    .where(and(eq(schema.evalResults.projectId, projectId), gte(schema.evalResults.createdAt, sql`now() - make_interval(hours => ${hours})`)))
    .orderBy(desc(schema.evalResults.createdAt)).limit(limit);
}

export async function evalScores(projectId: string, hours: number, evalDefinitionId?: string): Promise<number[]> {
  const rows = (await db().execute(sql`
    SELECT score::float8 AS score FROM regressa.eval_results
    WHERE project_id = ${projectId} AND score IS NOT NULL AND created_at >= now() - make_interval(hours => ${hours})
    ${evalDefinitionId ? sql`AND eval_definition_id = ${evalDefinitionId}` : sql``}
    LIMIT 5000
  `)) as unknown as { score: number }[];
  return rows.map((r) => Number(r.score));
}

export async function onboardingState(projectId: string) {
  const [r] = (await db().execute(sql`
    SELECT EXISTS(SELECT 1 FROM regressa.api_keys WHERE project_id = ${projectId} AND revoked_at IS NULL) AS has_key,
           EXISTS(SELECT 1 FROM regressa.traces WHERE project_id = ${projectId}) AS has_trace,
           EXISTS(SELECT 1 FROM regressa.prompt_templates WHERE project_id = ${projectId}) AS has_template,
           EXISTS(SELECT 1 FROM regressa.eval_definitions WHERE project_id = ${projectId}) AS has_eval,
           EXISTS(SELECT 1 FROM regressa.alert_rules WHERE project_id = ${projectId}) AS has_alert
  `)) as unknown as { has_key: boolean; has_trace: boolean; has_template: boolean; has_eval: boolean; has_alert: boolean }[];
  return { hasKey: !!r?.has_key, hasTrace: !!r?.has_trace, hasTemplate: !!r?.has_template, hasEval: !!r?.has_eval, hasAlert: !!r?.has_alert };
}

/** Traces this calendar month across the whole org (plan usage). */
export async function orgUsageThisMonth(orgId: string): Promise<number> {
  const [r] = (await db().execute(sql`
    SELECT count(*)::int AS n FROM regressa.traces t JOIN regressa.projects p ON p.id = t.project_id
    WHERE p.org_id = ${orgId} AND t.created_at >= date_trunc('month', now())
  `)) as unknown as { n: number }[];
  return Number(r?.n ?? 0);
}

export async function openAlertCount(projectId: string): Promise<number> {
  const [r] = await db().select({ n: sql<number>`count(*)::int` }).from(schema.alertEvents).where(and(eq(schema.alertEvents.projectId, projectId), eq(schema.alertEvents.status, "open")));
  return Number(r?.n ?? 0);
}
