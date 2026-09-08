import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { TraceInputSchema, type IngestResponse, type PersistTracesJob, type TraceInput } from "@regressa/shared-types";
import { config } from "../../config.js";

const LooseEnvelope = z.object({ traces: z.array(z.unknown()).min(1).max(1000), sdk: z.unknown().optional() });

export interface TracesRouteDeps {
  enqueue: (job: PersistTracesJob) => Promise<unknown>;
  maxBatch?: number;
  rateLimitPerMinute?: number;
  random?: () => number;
}

/**
 * Budget enforcement: when a project is over its monthly cap with action "sample_10", keep 10% of traces
 * (always keep CI gate runs so regression checks stay reliable). Returns the kept traces and how many were dropped.
 */
export function applyBudgetSampling(traces: TraceInput[], ctx: { budgetExceeded?: boolean; budgetAction?: string }, random: () => number = Math.random): { kept: TraceInput[]; dropped: number } {
  if (!ctx.budgetExceeded || ctx.budgetAction !== "sample_10") return { kept: traces, dropped: 0 };
  const kept = traces.filter((t) => t.metadata?.regressa_run != null || random() < 0.1);
  return { kept, dropped: traces.length - kept.length };
}

/** Pure request handling: validate, normalize, hand off. Exported for tests. */
export function normalizeBatch(body: unknown, maxBatch: number): { status: number; payload: unknown; accepted: TraceInput[] } {
  const envelope = LooseEnvelope.safeParse(body);
  let candidates: unknown[];
  if (envelope.success) candidates = envelope.data.traces;
  else if (body && typeof body === "object" && !("traces" in (body as object))) candidates = [body];
  else return { status: 400, payload: { error: "invalid_payload", issues: envelope.error?.issues.slice(0, 10) }, accepted: [] };

  if (candidates.length > maxBatch) return { status: 413, payload: { error: "batch_too_large", max: maxBatch }, accepted: [] };

  const accepted: TraceInput[] = [];
  const errors: IngestResponse["errors"] = [];
  candidates.forEach((c, index) => {
    const parsed = TraceInputSchema.safeParse(c);
    // Assign ids server-side so a retried persist job is idempotent (traces PK is id + created_at).
    if (parsed.success) accepted.push({ ...parsed.data, id: parsed.data.id ?? randomUUID(), timestamp: parsed.data.timestamp ?? new Date().toISOString() });
    else errors.push({ index, message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
  });
  const res: IngestResponse = { accepted: accepted.length, rejected: errors.length, errors };
  return { status: errors.length && !accepted.length ? 422 : 202, payload: res, accepted };
}

export async function tracesRoutes(app: FastifyInstance, deps: TracesRouteDeps) {
  const maxBatch = deps.maxBatch ?? config.maxBatch;
  app.post("/v1/traces", { config: { rateLimit: { max: deps.rateLimitPerMinute ?? config.rateLimitPerMinute, timeWindow: "1 minute" } } }, async (req, reply) => {
    const ctx = req.keyContext!;
    const { status, payload, accepted } = normalizeBatch(req.body, maxBatch);
    const { kept, dropped } = applyBudgetSampling(accepted, ctx, deps.random);
    if (kept.length > 0) await deps.enqueue({ projectId: ctx.projectId, apiKeyId: ctx.apiKeyId, traces: kept });
    if (ctx.budgetExceeded) reply.header("X-Regressa-Budget", ctx.budgetAction === "sample_10" ? `exceeded; sampled ${dropped}` : "exceeded");
    return reply.code(status).send(dropped ? { ...(payload as object), sampled_out: dropped } : payload);
  });
}
