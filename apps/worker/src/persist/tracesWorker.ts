import { Worker, type Job } from "bullmq";
import { and, eq, sql } from "drizzle-orm";
import { schema, type RegressaDb } from "@regressa/db";
import { QUEUE_TRACES, RedactionRulesSchema, estimateCostUsd, redactValue, type PersistTracesJob, type RedactionRule, type TraceInput } from "@regressa/shared-types";
import { connection, evalsQueue, notifyQueue } from "../queues.js";
import { config } from "../config.js";
import { resolvePromptVersion, type ResolvedVersion } from "./promptVersions.js";

export function startTracesWorker(db: RegressaDb) {
  return new Worker<PersistTracesJob>(QUEUE_TRACES, (job) => persistBatch(db, job), {
    connection, concurrency: config.concurrency.traces,
  });
}

const tplKey = (t: TraceInput) => (t.prompt_template ? `${t.prompt_template.name} ${t.prompt_template.raw}` : null);

const rulesCache = new Map<string, { rules: RedactionRule[]; expires: number }>();
/** Per-project redaction rules, cached 60s. Exported so tests can seed the cache. */
export async function projectRedactionRules(db: RegressaDb, projectId: string): Promise<RedactionRule[]> {
  const hit = rulesCache.get(projectId);
  if (hit && hit.expires > Date.now()) return hit.rules;
  const [row] = await db.select({ rules: schema.projects.redactionRules }).from(schema.projects).where(eq(schema.projects.id, projectId)).limit(1);
  const parsed = RedactionRulesSchema.safeParse(row?.rules ?? []);
  const rules = parsed.success ? parsed.data : [];
  rulesCache.set(projectId, { rules, expires: Date.now() + 60_000 });
  return rules;
}
export function seedRedactionRules(projectId: string, rules: RedactionRule[]) { rulesCache.set(projectId, { rules, expires: Date.now() + 60_000 }); }

/** Redact prompt/response/error/metadata before anything touches disk. */
export function redactTrace(t: TraceInput, rules: RedactionRule[]): TraceInput {
  if (rules.length === 0) return t;
  return {
    ...t,
    input_messages: redactValue(t.input_messages, rules),
    output_text: t.output_text == null ? t.output_text : redactValue(t.output_text, rules),
    error_message: t.error_message == null ? t.error_message : redactValue(t.error_message, rules),
    metadata: redactValue(t.metadata ?? {}, rules),
  };
}

export async function persistBatch(db: RegressaDb, job: Job<PersistTracesJob>) {
  const { projectId } = job.data;
  const rules = await projectRedactionRules(db, projectId);
  const traces = job.data.traces.map((t) => redactTrace(t, rules));

  // 1. Resolve prompt versions (dedupe by template within the batch).
  const versionCache = new Map<string, ResolvedVersion>();
  const newVersions: { templateId: string; versionNumber: number; name: string }[] = [];
  for (const t of traces) {
    const key = tplKey(t);
    if (!key || versionCache.has(key)) continue;
    const v = await resolvePromptVersion(db, projectId, t.prompt_template!.name, t.prompt_template!.raw);
    versionCache.set(key, v);
    if (v.isNew && v.versionNumber > 1) newVersions.push({ templateId: v.promptTemplateId, versionNumber: v.versionNumber, name: t.prompt_template!.name });
  }

  // 2. Insert traces (idempotent on client-supplied id + timestamp).
  const rows = traces.map((t) => toRow(projectId, t, versionCache.get(tplKey(t) ?? "")?.promptVersionId));
  const inserted = await db.insert(schema.traces).values(rows).onConflictDoNothing()
    .returning({ id: schema.traces.id, createdAt: schema.traces.createdAt, promptVersionId: schema.traces.promptVersionId });

  // 3. Fan out eval jobs for active definitions (respecting sample_rate and template scoping).
  const defs = await db.select({
    id: schema.evalDefinitions.id, sampleRate: schema.evalDefinitions.sampleRate, promptTemplateId: schema.evalDefinitions.promptTemplateId,
  }).from(schema.evalDefinitions).where(and(eq(schema.evalDefinitions.projectId, projectId), eq(schema.evalDefinitions.isActive, true)));

  if (defs.length && inserted.length) {
    const versionToTemplate = new Map<string, string>();
    for (const v of versionCache.values()) versionToTemplate.set(v.promptVersionId, v.promptTemplateId);
    const jobs = [];
    for (const tr of inserted) {
      for (const d of defs) {
        if (d.promptTemplateId && versionToTemplate.get(tr.promptVersionId ?? "") !== d.promptTemplateId) continue;
        if (Math.random() > Number(d.sampleRate)) continue;
        jobs.push({
          name: "eval",
          data: { projectId, traceId: tr.id, traceCreatedAt: tr.createdAt.toISOString(), evalDefinitionId: d.id },
          opts: { jobId: `${tr.id}_${d.id}` },
        });
      }
    }
    if (jobs.length) await evalsQueue.addBulk(jobs);
  }

  // 4. Prompt-version-change alerts fire immediately (not window-based).
  if (newVersions.length) await emitVersionChangeAlerts(db, projectId, newVersions);

  return { inserted: inserted.length, newVersions: newVersions.length };
}

export function toRow(projectId: string, t: TraceInput, promptVersionId?: string): typeof schema.traces.$inferInsert {
  const cost = t.total_cost_usd ?? estimateCostUsd(t.model, t.prompt_tokens, t.completion_tokens);
  return {
    id: t.id, projectId, promptVersionId,
    model: t.model, provider: t.provider, inputMessages: t.input_messages, outputText: t.output_text ?? null,
    promptTokens: t.prompt_tokens, completionTokens: t.completion_tokens,
    totalCostUsd: cost == null ? null : cost.toFixed(6),
    latencyMs: t.latency_ms, status: t.status, errorMessage: t.error_message, traceGroupId: t.trace_group_id,
    metadata: t.metadata ?? {}, createdAt: t.timestamp ? new Date(t.timestamp) : new Date(),
  };
}

async function emitVersionChangeAlerts(db: RegressaDb, projectId: string, versions: { templateId: string; versionNumber: number; name: string }[]) {
  const rules = await db.select().from(schema.alertRules).where(and(
    eq(schema.alertRules.projectId, projectId), eq(schema.alertRules.isActive, true), eq(schema.alertRules.metric, "prompt_version_change"),
  ));
  for (const rule of rules) {
    for (const v of versions) {
      if (rule.promptTemplateId && rule.promptTemplateId !== v.templateId) continue;
      const [ev] = await db.insert(schema.alertEvents).values({
        alertRuleId: rule.id, projectId, triggeredValue: String(v.versionNumber),
        message: `Prompt template "${v.name}" changed - now at v${v.versionNumber}. Regressa will compare eval scores against v${v.versionNumber - 1}.`,
      }).returning({ id: schema.alertEvents.id });
      await db.update(schema.alertRules).set({ lastTriggeredAt: sql`now()` }).where(eq(schema.alertRules.id, rule.id));
      await notifyQueue.add("notify", { alertEventId: ev!.id });
    }
  }
}
