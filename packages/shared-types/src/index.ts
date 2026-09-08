import { z } from "zod";

export const REGRESSA_KEY_HEADER = "x-regressa-project-key";
export const REGRESSA_INGEST_PATH = "/v1/traces";

export const Provider = z.enum(["openai", "anthropic", "other"]);
export type Provider = z.infer<typeof Provider>;

export const TraceStatus = z.enum(["success", "error", "timeout"]);
export type TraceStatus = z.infer<typeof TraceStatus>;

export const MessageSchema = z.object({
  role: z.string(),
  content: z.unknown(), // string | content-block[] — provider-specific; stored verbatim
  name: z.string().optional(),
});

/** The prompt template the SDK detected for this call. `raw` is hashed server-side. */
export const PromptTemplateRef = z.object({
  name: z.string().min(1).max(200),
  raw: z.string().min(1),
});

export const TraceInputSchema = z.object({
  id: z.string().uuid().optional(),                    // client-generated; enables idempotent retries
  timestamp: z.string().datetime().optional(),         // when the call happened (defaults to server now)
  model: z.string().min(1),
  provider: Provider,
  input_messages: z.array(MessageSchema).min(1),
  output_text: z.string().nullable().optional(),
  prompt_tokens: z.number().int().nonnegative().optional(),
  completion_tokens: z.number().int().nonnegative().optional(),
  total_cost_usd: z.number().nonnegative().optional(), // if omitted, server estimates from model pricing
  latency_ms: z.number().int().nonnegative().optional(),
  status: TraceStatus.default("success"),
  error_message: z.string().optional(),
  trace_group_id: z.string().max(200).optional(),
  prompt_template: PromptTemplateRef.optional(),
  metadata: z.record(z.unknown()).default({}),
});
export type TraceInput = z.infer<typeof TraceInputSchema>;

export const IngestBatchSchema = z.object({
  traces: z.array(TraceInputSchema).min(1).max(1000),
  sdk: z.object({ name: z.string(), version: z.string() }).optional(),
});
export type IngestBatch = z.infer<typeof IngestBatchSchema>;

export const IngestResponseSchema = z.object({
  accepted: z.number().int(),
  rejected: z.number().int(),
  errors: z.array(z.object({ index: z.number().int(), message: z.string() })),
});
export type IngestResponse = z.infer<typeof IngestResponseSchema>;

// ---------- Eval definitions ----------
export const EvalType = z.enum(["semantic_similarity", "llm_judge", "custom_function"]);
export type EvalType = z.infer<typeof EvalType>;

export const SemanticSimilarityConfig = z.object({
  pass_threshold: z.number().min(0).max(1).default(0.85),
  embedding_model: z.string().default("text-embedding-3-small"),
});
export const LlmJudgeConfig = z.object({
  rubric: z.string().min(1),
  judge_model: z.string().optional(),
  pass_threshold: z.number().min(0).max(1).default(0.7),
});
export const CustomFunctionConfig = z.object({
  /** JS expression body evaluated in a sandbox with `trace` in scope; must return {score, passed?, reasoning?} */
  source: z.string().min(1),
  pass_threshold: z.number().min(0).max(1).default(0.5),
});

export const EvalResultPayload = z.object({
  score: z.number().min(0).max(1),
  passed: z.boolean(),
  reasoning: z.string().optional(),
  eval_cost_usd: z.number().nonnegative().optional(),
});
export type EvalResultPayload = z.infer<typeof EvalResultPayload>;

// ---------- Alerts ----------
export const AlertMetric = z.enum(["cost", "latency_p95", "error_rate", "eval_score", "prompt_version_change", "budget"]);
export type AlertMetric = z.infer<typeof AlertMetric>;
export const AlertCondition = z.enum(["gt", "lt", "pct_change", "anomaly", "any"]);
export type AlertCondition = z.infer<typeof AlertCondition>;
export const AlertChannel = z.enum(["slack", "email", "webhook"]);
export type AlertChannel = z.infer<typeof AlertChannel>;

// ---------- Queue job payloads ----------
export const QUEUE_TRACES = "regressa-traces";
export const QUEUE_EVALS = "regressa-evals";
export const QUEUE_ALERTS = "regressa-alerts";
export const QUEUE_NOTIFY = "regressa-notify";
export const QUEUE_MAINTENANCE = "regressa-maintenance";

export interface PersistTracesJob { projectId: string; apiKeyId: string; traces: TraceInput[] }
export interface RunEvalJob { projectId: string; traceId: string; traceCreatedAt: string; evalDefinitionId: string }
export interface EvaluateAlertsJob { projectId?: string }
export interface NotifyJob { alertEventId: string }
export interface MaintenanceJob { task: "retention" | "digest" }

// ---------- CI regression gate ----------
export interface GateSide { request_count: number; eval_count: number; avg_eval_score: number | null; pass_rate: number | null; p95_latency_ms: number; error_rate: number; avg_cost_usd: number; version_number: number | null }
export interface GateResult {
  template: string; run: string | null;
  candidate: GateSide; baseline: GateSide;
  checks: { name: string; ok: boolean; detail: string }[];
  status: "pass" | "fail" | "pending";
  pending_reason?: string;
}

// ---------- Model pricing (USD per 1M tokens) ----------
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // OpenAI
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4.1": { input: 2, output: 8 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "o3": { input: 2, output: 8 },
  "o4-mini": { input: 1.1, output: 4.4 },
  // Anthropic
  "claude-fable-5-1": { input: 15, output: 75 },
  "claude-opus-5": { input: 15, output: 75 },
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-haiku-4-5-20251001": { input: 1, output: 5 },
  "claude-sonnet-4-5": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

export function estimateCostUsd(model: string, promptTokens?: number, completionTokens?: number): number | null {
  if (promptTokens == null && completionTokens == null) return null;
  promptTokens ??= 0; completionTokens ??= 0;
  // Exact match first, then the LONGEST prefix so "gpt-4o-mini-2024-07-18" resolves to gpt-4o-mini, not gpt-4o.
  const key = MODEL_PRICING[model] ? model : Object.keys(MODEL_PRICING).filter((k) => model.startsWith(k)).sort((a, b) => b.length - a.length)[0];
  if (!key) return null;
  const p = MODEL_PRICING[key]!;
  return (promptTokens * p.input + completionTokens * p.output) / 1_000_000;
}

/** Normalize a prompt template before hashing so whitespace-only edits don't create new versions. */
export function normalizeTemplate(raw: string): string {
  return raw.replace(/\r\n/g, "\n").split("\n").map((l) => l.trimEnd()).join("\n").trim();
}

// ---------- Plans ----------
export const PLAN_LIMITS: Record<string, { tracesPerMonth: number; retentionDays: number; members: number; label: string }> = {
  free: { tracesPerMonth: 10_000, retentionDays: 7, members: 2, label: "Free" },
  pro: { tracesPerMonth: 500_000, retentionDays: 30, members: 10, label: "Pro" },
  team: { tracesPerMonth: 5_000_000, retentionDays: 90, members: 50, label: "Team" },
  enterprise: { tracesPerMonth: Number.POSITIVE_INFINITY, retentionDays: 365, members: Number.POSITIVE_INFINITY, label: "Enterprise" },
};
export function planLimits(plan: string) { return PLAN_LIMITS[plan] ?? PLAN_LIMITS.free!; }

export * from "./redaction.js";
export * from "./anomaly.js";
