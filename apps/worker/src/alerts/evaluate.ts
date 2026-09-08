import { and, eq, sql } from "drizzle-orm";
import { schema, type RegressaDb } from "@regressa/db";
import { detectAnomaly } from "@regressa/shared-types";
import { monthlySpend, windowEvalScore, windowHistory, windowMetrics } from "./metrics.js";
import { notifyQueue } from "../queues.js";

type Rule = typeof schema.alertRules.$inferSelect;

/**
 * Rules engine. For each active, non-cooling-down rule:
 *   gt / lt        -> compare current window value to threshold
 *   pct_change     -> compare current window to the immediately preceding window; threshold is a percent
 *   anomaly        -> z-score of the current window against the previous 24 windows; threshold is the z cutoff (default 3)
 *   budget metric  -> monthly spend vs the project's budget_monthly_usd; also flips projects.budget_exceeded_at
 * prompt_version_change rules are handled inline by the traces worker.
 */
export async function evaluateAlertRules(db: RegressaDb, projectId?: string): Promise<number> {
  const rules = await db.select().from(schema.alertRules).where(and(
    eq(schema.alertRules.isActive, true),
    projectId ? eq(schema.alertRules.projectId, projectId) : sql`true`,
    sql`${schema.alertRules.metric} != 'prompt_version_change'`,
    sql`(${schema.alertRules.lastTriggeredAt} IS NULL OR ${schema.alertRules.lastTriggeredAt} < now() - make_interval(mins => ${schema.alertRules.cooldownMinutes}))`,
  ));

  let fired = 0;
  for (const rule of rules) {
    try {
      const outcome = await checkRule(db, rule);
      if (!outcome) continue;
      const [ev] = await db.insert(schema.alertEvents).values({
        alertRuleId: rule.id, projectId: rule.projectId,
        triggeredValue: String(outcome.current), baselineValue: outcome.baseline == null ? null : String(outcome.baseline),
        message: outcome.message,
      }).returning({ id: schema.alertEvents.id });
      await db.update(schema.alertRules).set({ lastTriggeredAt: sql`now()` }).where(eq(schema.alertRules.id, rule.id));
      await notifyQueue.add("notify", { alertEventId: ev!.id });
      fired++;
    } catch (err) {
      console.error(`[alerts] rule ${rule.id} failed:`, err);
    }
  }
  return fired;
}

export async function checkRule(db: RegressaDb, rule: Rule): Promise<{ current: number; baseline?: number; message: string } | null> {
  const minutes = rule.windowMinutes;
  const threshold = Number(rule.threshold);

  if (rule.metric === "budget") return checkBudget(db, rule);

  const current = await metricValue(db, rule, 0);
  if (current.sample < minSamples(rule.metric)) return null; // avoid alerting on noise

  const label = METRIC_LABELS[rule.metric] ?? rule.metric;
  const fmt = (v: number) => formatMetric(rule.metric, v);

  switch (rule.condition) {
    case "gt":
      return current.value > threshold
        ? { current: current.value, message: `${label} is ${fmt(current.value)} over the last ${minutes}m (threshold ${fmt(threshold)}).` }
        : null;
    case "lt":
      return current.value < threshold
        ? { current: current.value, message: `${label} dropped to ${fmt(current.value)} over the last ${minutes}m (threshold ${fmt(threshold)}).` }
        : null;
    case "pct_change": {
      const baseline = await metricValue(db, rule, minutes);
      if (baseline.sample < minSamples(rule.metric) || baseline.value === 0) return null;
      const pct = ((current.value - baseline.value) / baseline.value) * 100;
      // For eval_score a drop is the regression; for cost / latency / error_rate a rise is.
      const regressed = rule.metric === "eval_score" ? pct <= -Math.abs(threshold) : pct >= Math.abs(threshold);
      return regressed
        ? {
            current: current.value, baseline: baseline.value,
            message: `${label} changed ${pct.toFixed(1)}% (${fmt(baseline.value)} -> ${fmt(current.value)}) vs the previous ${minutes}m window.`,
          }
        : null;
    }
    case "anomaly": {
      const history = await windowHistory(db, rule, 24);
      const direction = rule.metric === "eval_score" ? "down" : "up";
      const a = detectAnomaly(current.value, history, { zThreshold: threshold > 0 ? threshold : 3, direction });
      return a.anomalous
        ? { current: current.value, baseline: a.mean,
            message: `${label} is ${fmt(current.value)} over the last ${minutes}m, ${Math.abs(a.zScore).toFixed(1)} standard deviations ${a.zScore > 0 ? "above" : "below"} its rolling baseline of ${fmt(a.mean)} (${a.sample} windows).` }
        : null;
    }
    default:
      return null;
  }
}

/** Budget rules fire once when the month's spend crosses the project cap, and keep the project flag in sync. */
export async function checkBudget(db: RegressaDb, rule: Rule): Promise<{ current: number; baseline?: number; message: string } | null> {
  const [project] = await db.select({ budget: schema.projects.budgetMonthlyUsd, exceededAt: schema.projects.budgetExceededAt, action: schema.projects.budgetAction })
    .from(schema.projects).where(eq(schema.projects.id, rule.projectId)).limit(1);
  if (!project?.budget) return null;
  const budget = Number(project.budget);
  const spend = await monthlySpend(db, rule.projectId);
  const over = spend >= budget;
  if (over && !project.exceededAt) {
    await db.update(schema.projects).set({ budgetExceededAt: sql`now()` }).where(eq(schema.projects.id, rule.projectId));
    return { current: spend, baseline: budget,
      message: `Monthly LLM spend reached $${spend.toFixed(2)} of the $${budget.toFixed(2)} budget${project.action === "sample_10" ? ". Ingestion is now sampling 10% of traces until the month resets." : "."}` };
  }
  if (!over && project.exceededAt) {
    // New month (or budget raised): clear the flag so sampling stops.
    await db.update(schema.projects).set({ budgetExceededAt: null }).where(eq(schema.projects.id, rule.projectId));
  }
  return null;
}

async function metricValue(db: RegressaDb, rule: Rule, endOffset: number): Promise<{ value: number; sample: number }> {
  if (rule.metric === "eval_score") {
    const r = await windowEvalScore(db, rule.projectId, rule.evalDefinitionId, rule.windowMinutes, endOffset);
    return { value: r.avg, sample: r.count };
  }
  const m = await windowMetrics(db, rule.projectId, rule.windowMinutes, endOffset, rule.promptTemplateId);
  const value = rule.metric === "cost" ? m.cost : rule.metric === "latency_p95" ? m.latency_p95 : rule.metric === "error_rate" ? m.error_rate : 0;
  return { value, sample: m.request_count };
}

function minSamples(metric: string) { return metric === "eval_score" ? 5 : metric === "error_rate" ? 20 : 1; }

const METRIC_LABELS: Record<string, string> = { cost: "Cost", latency_p95: "p95 latency", error_rate: "Error rate", eval_score: "Eval score", budget: "Monthly budget" };

function formatMetric(metric: string, v: number) {
  switch (metric) {
    case "cost": return `$${v.toFixed(4)}`;
    case "latency_p95": return `${Math.round(v)}ms`;
    case "error_rate": return `${(v * 100).toFixed(2)}%`;
    case "eval_score": return v.toFixed(3);
    default: return String(v);
  }
}
