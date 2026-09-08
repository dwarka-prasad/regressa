import { Worker } from "bullmq";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { schema, type RegressaDb } from "@regressa/db";
import { QUEUE_MAINTENANCE, planLimits, type MaintenanceJob } from "@regressa/shared-types";
import { connection, maintenanceQueue } from "../queues.js";
import { sendEmail } from "../alerts/email.js";

/**
 * Housekeeping jobs:
 *   retention (hourly): delete traces + eval results older than each project's retention (capped by plan).
 *   digest (hourly check, sends weekly): per-org summary email to owners/admins when weekly_digest is on.
 */
export async function startMaintenanceWorker(db: RegressaDb) {
  await maintenanceQueue.upsertJobScheduler("retention-hourly", { every: 60 * 60_000 }, { name: "retention", data: { task: "retention" } });
  await maintenanceQueue.upsertJobScheduler("digest-hourly", { every: 60 * 60_000 }, { name: "digest", data: { task: "digest" } });

  return new Worker<MaintenanceJob>(QUEUE_MAINTENANCE, async (job) => {
    if (job.data.task === "retention") return runRetention(db);
    if (job.data.task === "digest") return runDigests(db);
    return null;
  }, { connection, concurrency: 1 });
}

/** Effective retention: the project override if set, never longer than the plan allows. */
export function effectiveRetentionDays(plan: string, projectOverride: number | null | undefined): number {
  const max = planLimits(plan).retentionDays;
  if (projectOverride == null || projectOverride <= 0) return max;
  return Math.min(projectOverride, max);
}

export async function runRetention(db: RegressaDb) {
  const projects = await db.select({ id: schema.projects.id, override: schema.projects.retentionDays, plan: schema.orgs.plan })
    .from(schema.projects).innerJoin(schema.orgs, eq(schema.orgs.id, schema.projects.orgId));
  let deleted = 0;
  for (const p of projects) {
    const days = effectiveRetentionDays(p.plan, p.override);
    const r1 = await db.execute(sql`DELETE FROM regressa.eval_results WHERE project_id = ${p.id} AND created_at < now() - make_interval(days => ${days})`);
    const r2 = await db.execute(sql`DELETE FROM regressa.traces WHERE project_id = ${p.id} AND created_at < now() - make_interval(days => ${days})`);
    deleted += Number((r1 as unknown as { count?: number }).count ?? 0) + Number((r2 as unknown as { count?: number }).count ?? 0);
  }
  if (deleted) console.log(`[maintenance] retention removed ${deleted} rows`);
  return { deleted };
}

export interface DigestRow { project: string; requests: number; cost: number; p95: number; errorRate: number; evalScore: number | null; newVersions: number; alerts: number }

export function renderDigest(orgName: string, rows: DigestRow[], appUrl: string): { subject: string; text: string; html: string } {
  const totalCost = rows.reduce((a, r) => a + r.cost, 0);
  const totalReq = rows.reduce((a, r) => a + r.requests, 0);
  const subject = `Regressa weekly: ${orgName} - ${totalReq.toLocaleString()} requests, $${totalCost.toFixed(2)}`;
  const lines = rows.map((r) => `${r.project}: ${r.requests} req, $${r.cost.toFixed(2)}, p95 ${Math.round(r.p95)}ms, errors ${(r.errorRate * 100).toFixed(1)}%, eval ${r.evalScore == null ? "n/a" : r.evalScore.toFixed(2)}, ${r.newVersions} prompt change(s), ${r.alerts} alert(s)`);
  const text = [`Weekly summary for ${orgName}`, "", ...lines, "", `Open Regressa: ${appUrl}/overview`].join("\n");
  const html = `<h2>Weekly summary for ${esc(orgName)}</h2><table cellpadding="6" style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
<tr><th align="left">Project</th><th>Requests</th><th>Cost</th><th>p95</th><th>Errors</th><th>Eval</th><th>Prompt changes</th><th>Alerts</th></tr>
${rows.map((r) => `<tr><td>${esc(r.project)}</td><td align="right">${r.requests}</td><td align="right">$${r.cost.toFixed(2)}</td><td align="right">${Math.round(r.p95)}ms</td><td align="right">${(r.errorRate * 100).toFixed(1)}%</td><td align="right">${r.evalScore == null ? "n/a" : r.evalScore.toFixed(2)}</td><td align="right">${r.newVersions}</td><td align="right">${r.alerts}</td></tr>`).join("")}
</table><p><a href="${appUrl}/overview">Open Regressa</a></p>`;
  return { subject, text, html };
}

export async function runDigests(db: RegressaDb) {
  if (!process.env.SMTP_URL) return { sent: 0, skipped: "SMTP_URL not set" };
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3100";
  const orgs = await db.select().from(schema.orgs).where(and(eq(schema.orgs.weeklyDigest, true),
    sql`(${schema.orgs.lastDigestAt} IS NULL OR ${schema.orgs.lastDigestAt} < now() - interval '7 days')`));
  let sent = 0;
  for (const org of orgs) {
    const rows = (await db.execute(sql`
      SELECT p.name AS project,
             (SELECT count(*)::int FROM regressa.traces t WHERE t.project_id = p.id AND t.created_at >= now() - interval '7 days') AS requests,
             (SELECT coalesce(sum(total_cost_usd),0)::float8 FROM regressa.traces t WHERE t.project_id = p.id AND t.created_at >= now() - interval '7 days') AS cost,
             (SELECT coalesce(percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms),0)::float8 FROM regressa.traces t WHERE t.project_id = p.id AND t.created_at >= now() - interval '7 days') AS p95,
             (SELECT CASE WHEN count(*)=0 THEN 0 ELSE (count(*) FILTER (WHERE status != 'success'))::float8/count(*) END FROM regressa.traces t WHERE t.project_id = p.id AND t.created_at >= now() - interval '7 days') AS error_rate,
             (SELECT avg(score)::float8 FROM regressa.eval_results er WHERE er.project_id = p.id AND er.created_at >= now() - interval '7 days') AS eval_score,
             (SELECT count(*)::int FROM regressa.prompt_versions pv JOIN regressa.prompt_templates pt ON pt.id = pv.prompt_template_id WHERE pt.project_id = p.id AND pv.first_seen_at >= now() - interval '7 days') AS new_versions,
             (SELECT count(*)::int FROM regressa.alert_events ae WHERE ae.project_id = p.id AND ae.created_at >= now() - interval '7 days') AS alerts
      FROM regressa.projects p WHERE p.org_id = ${org.id} ORDER BY p.name
    `)) as unknown as { project: string; requests: number; cost: number; p95: number; error_rate: number; eval_score: number | null; new_versions: number; alerts: number }[];
    const recipients = await db.select({ email: schema.users.email }).from(schema.orgMembers)
      .innerJoin(schema.users, eq(schema.users.id, schema.orgMembers.userId))
      .where(and(eq(schema.orgMembers.orgId, org.id), sql`${schema.orgMembers.role} IN ('owner','admin')`, isNotNull(schema.users.email)));
    if (recipients.length === 0 || rows.length === 0) continue;
    const digest = renderDigest(org.name, rows.map((r) => ({ project: r.project, requests: Number(r.requests), cost: Number(r.cost), p95: Number(r.p95), errorRate: Number(r.error_rate), evalScore: r.eval_score == null ? null : Number(r.eval_score), newVersions: Number(r.new_versions), alerts: Number(r.alerts) })), appUrl);
    try {
      await sendEmail({ to: recipients.map((r) => r.email).join(", "), ...digest });
      await db.update(schema.orgs).set({ lastDigestAt: sql`now()` }).where(eq(schema.orgs.id, org.id));
      sent++;
    } catch (err) {
      console.error(`[maintenance] digest for ${org.slug} failed:`, err);
    }
  }
  return { sent };
}

function esc(s: string) { return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!); }
