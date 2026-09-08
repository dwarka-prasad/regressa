import type { FastifyInstance } from "fastify";
import type { TraceInput } from "@regressa/shared-types";
import { normalizeBatch, type TracesRouteDeps } from "./traces.js";

/**
 * OpenTelemetry ingestion (OTLP/HTTP JSON). Maps spans carrying GenAI semantic conventions
 * (gen_ai.request.model, gen_ai.system, gen_ai.usage.*, gen_ai.prompt / gen_ai.completion events or attributes)
 * onto Regressa traces. Spans without a gen_ai model are ignored.
 */
type AnyValue = { stringValue?: string; intValue?: string | number; doubleValue?: number; boolValue?: boolean; arrayValue?: { values: AnyValue[] } };
type KeyValue = { key: string; value: AnyValue };
interface OtlpSpan {
  traceId?: string; spanId?: string; name?: string; startTimeUnixNano?: string | number; endTimeUnixNano?: string | number;
  attributes?: KeyValue[]; events?: { name: string; attributes?: KeyValue[] }[]; status?: { code?: number; message?: string };
}
export interface OtlpPayload { resourceSpans?: { resource?: { attributes?: KeyValue[] }; scopeSpans?: { spans?: OtlpSpan[] }[] }[] }

function val(v: AnyValue | undefined): unknown {
  if (!v) return undefined;
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.intValue !== undefined) return Number(v.intValue);
  if (v.doubleValue !== undefined) return v.doubleValue;
  if (v.boolValue !== undefined) return v.boolValue;
  if (v.arrayValue) return v.arrayValue.values.map(val);
  return undefined;
}
function attrs(list: KeyValue[] | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const kv of list ?? []) out[kv.key] = val(kv.value);
  return out;
}
function provider(system: unknown): TraceInput["provider"] {
  const s = String(system ?? "").toLowerCase();
  if (s.includes("openai")) return "openai";
  if (s.includes("anthropic")) return "anthropic";
  return "other";
}
function parseMaybeJson(v: unknown): unknown {
  if (typeof v !== "string") return v;
  try { return JSON.parse(v); } catch { return v; }
}

export function otlpToTraces(payload: OtlpPayload): TraceInput[] {
  const out: TraceInput[] = [];
  for (const rs of payload.resourceSpans ?? []) {
    const resource = attrs(rs.resource?.attributes);
    for (const ss of rs.scopeSpans ?? []) {
      for (const span of ss.spans ?? []) {
        const a = attrs(span.attributes);
        const model = a["gen_ai.request.model"] ?? a["gen_ai.response.model"] ?? a["llm.model"];
        if (!model) continue;

        // Prompt/completion: prefer explicit attributes, then events (gen_ai.content.prompt / gen_ai.content.completion).
        const messages: { role: string; content: unknown }[] = [];
        const promptAttr = parseMaybeJson(a["gen_ai.prompt"] ?? a["llm.prompts"]);
        if (Array.isArray(promptAttr)) for (const m of promptAttr) messages.push(typeof m === "string" ? { role: "user", content: m } : (m as { role: string; content: unknown }));
        else if (typeof promptAttr === "string") messages.push({ role: "user", content: promptAttr });
        let completion = a["gen_ai.completion"] as string | undefined;
        for (const ev of span.events ?? []) {
          const ea = attrs(ev.attributes);
          if (ev.name === "gen_ai.content.prompt" || ev.name === "gen_ai.user.message" || ev.name === "gen_ai.system.message") {
            const content = parseMaybeJson(ea["gen_ai.prompt"] ?? ea["content"]);
            messages.push({ role: ev.name === "gen_ai.system.message" ? "system" : "user", content });
          }
          if (ev.name === "gen_ai.content.completion" || ev.name === "gen_ai.choice") {
            const c = parseMaybeJson(ea["gen_ai.completion"] ?? ea["content"] ?? ea["message"]);
            completion = typeof c === "string" ? c : c && typeof c === "object" && "content" in (c as object) ? String((c as { content: unknown }).content) : JSON.stringify(c);
          }
        }
        if (messages.length === 0) messages.push({ role: "user", content: span.name ?? "(no prompt captured)" });

        const start = Number(span.startTimeUnixNano ?? 0), end = Number(span.endTimeUnixNano ?? 0);
        const latency = start && end ? Math.max(0, Math.round((end - start) / 1e6)) : undefined;
        const errored = span.status?.code === 2;
        const templateName = a["regressa.prompt_template.name"] ?? a["gen_ai.prompt.template.name"];
        const templateRaw = a["regressa.prompt_template.raw"] ?? a["gen_ai.prompt.template"];
        const metadata: Record<string, unknown> = { otel: { trace_id: span.traceId, span_id: span.spanId, span_name: span.name, service: resource["service.name"] } };
        for (const [k, v] of Object.entries(a)) if (k.startsWith("regressa.meta.")) metadata[k.slice("regressa.meta.".length)] = v;

        out.push({
          timestamp: start ? new Date(start / 1e6).toISOString() : undefined,
          model: String(model),
          provider: provider(a["gen_ai.system"]),
          input_messages: messages,
          output_text: completion ?? null,
          prompt_tokens: numOrUndef(a["gen_ai.usage.input_tokens"] ?? a["gen_ai.usage.prompt_tokens"]),
          completion_tokens: numOrUndef(a["gen_ai.usage.output_tokens"] ?? a["gen_ai.usage.completion_tokens"]),
          latency_ms: latency,
          status: errored ? "error" : "success",
          error_message: errored ? span.status?.message ?? "span status ERROR" : undefined,
          trace_group_id: span.traceId,
          prompt_template: templateName && templateRaw ? { name: String(templateName), raw: String(templateRaw) } : undefined,
          metadata,
        });
      }
    }
  }
  return out;
}

function numOrUndef(v: unknown): number | undefined { const n = Number(v); return v == null || Number.isNaN(n) ? undefined : n; }

export async function otlpRoutes(app: FastifyInstance, deps: TracesRouteDeps) {
  app.post("/v1/otlp/traces", async (req, reply) => {
    const ctx = req.keyContext!;
    const traces = otlpToTraces((req.body ?? {}) as OtlpPayload);
    if (traces.length === 0) return reply.code(202).send({ accepted: 0, rejected: 0, errors: [], note: "no spans with gen_ai.request.model" });
    const { status, payload, accepted } = normalizeBatch({ traces }, deps.maxBatch ?? 1000);
    if (accepted.length > 0) await deps.enqueue({ projectId: ctx.projectId, apiKeyId: ctx.apiKeyId, traces: accepted });
    // OTLP clients expect an (empty) ExportTraceServiceResponse-shaped body on success.
    return reply.code(status === 202 ? 200 : status).send(status === 202 ? { partialSuccess: {}, regressa: payload } : payload);
  });
}
