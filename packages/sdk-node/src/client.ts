import type { RegressaOptions, TraceInput, CallOptions } from "./types.js";

export const SDK_NAME = "@regressa/node";
export const SDK_VERSION = "0.1.0";
export const KEY_HEADER = "X-Regressa-Project-Key";

export class Regressa {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly flushAt: number;
  private readonly flushIntervalMs: number;
  private readonly disabled: boolean;
  private readonly redact?: RegressaOptions["redact"];
  private readonly defaultMetadata: Record<string, unknown>;
  private readonly onError: (err: unknown) => void;
  private readonly fetchImpl: typeof fetch;

  private buffer: TraceInput[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inflight = new Set<Promise<void>>();
  private warned = false;

  constructor(opts: RegressaOptions = {}) {
    const env = (typeof process !== "undefined" ? process.env : {}) as Record<string, string | undefined>;
    this.apiKey = opts.apiKey ?? env.REGRESSA_API_KEY ?? "";
    this.baseUrl = (opts.baseUrl ?? env.REGRESSA_BASE_URL ?? "https://ingest.regressa.dev").replace(/\/$/, "");
    this.flushAt = opts.flushAt ?? 50;
    this.flushIntervalMs = opts.flushIntervalMs ?? 2000;
    this.disabled = opts.disabled ?? env.REGRESSA_DISABLED === "1";
    this.redact = opts.redact;
    this.defaultMetadata = opts.defaultMetadata ?? {};
    this.fetchImpl = opts.fetch ?? globalThis.fetch;
    this.onError = opts.onError ?? ((err) => {
      if (this.warned) return;
      this.warned = true;
      console.warn("[regressa] failed to send traces:", err instanceof Error ? err.message : err);
    });
    if (!this.apiKey && !this.disabled) {
      console.warn("[regressa] no API key set (REGRESSA_API_KEY). Tracing disabled.");
      this.disabled = true;
    }
    if (typeof process !== "undefined" && typeof process.on === "function") {
      process.once("beforeExit", () => { void this.flush(); });
    }
  }

  /** Record a trace manually (for providers the SDK doesn't wrap yet). */
  trace(input: TraceInput): void {
    if (this.disabled) return;
    const t: TraceInput = {
      ...input,
      id: input.id ?? randomUUID(),
      timestamp: input.timestamp ?? new Date().toISOString(),
      input_messages: this.redact ? this.redact(input.input_messages) : input.input_messages,
      metadata: { ...this.defaultMetadata, ...(input.metadata ?? {}) },
    };
    this.buffer.push(t);
    if (this.buffer.length >= this.flushAt) void this.flush();
    else if (!this.timer) this.timer = setTimeout(() => void this.flush(), this.flushIntervalMs);
  }

  /** Time an arbitrary async LLM call and record it. */
  async span<T>(
    meta: Omit<TraceInput, "latency_ms" | "status" | "output_text" | "error_message"> & CallOptions,
    fn: () => Promise<T>,
    extract: (result: T) => Partial<Pick<TraceInput, "output_text" | "prompt_tokens" | "completion_tokens" | "model">>,
  ): Promise<T> {
    const started = Date.now();
    try {
      const result = await fn();
      this.trace({ ...meta, ...extract(result), latency_ms: Date.now() - started, status: "success",
        prompt_template: meta.promptTemplate ?? meta.prompt_template, trace_group_id: meta.traceGroupId ?? meta.trace_group_id });
      return result;
    } catch (err) {
      this.trace({ ...meta, latency_ms: Date.now() - started, status: isTimeout(err) ? "timeout" : "error",
        error_message: err instanceof Error ? err.message : String(err),
        prompt_template: meta.promptTemplate ?? meta.prompt_template, trace_group_id: meta.traceGroupId ?? meta.trace_group_id });
      throw err;
    }
  }

  /** Flush buffered traces now. Safe to call repeatedly; awaits in-flight sends. */
  async flush(): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.buffer.length === 0) { await Promise.allSettled([...this.inflight]); return; }
    const batch = this.buffer;
    this.buffer = [];
    const p = this.send(batch).finally(() => this.inflight.delete(p));
    this.inflight.add(p);
    await Promise.allSettled([...this.inflight]);
  }

  /** Flush and stop timers. Call on shutdown. */
  async shutdown(): Promise<void> {
    await this.flush();
  }

  private async send(traces: TraceInput[], attempt = 0): Promise<void> {
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/v1/traces`, {
        method: "POST",
        headers: { "Content-Type": "application/json", [KEY_HEADER]: this.apiKey, "User-Agent": `${SDK_NAME}/${SDK_VERSION}` },
        body: JSON.stringify({ traces, sdk: { name: SDK_NAME, version: SDK_VERSION } }),
      });
      if (res.status === 429 || res.status >= 500) throw new Error(`regressa ingest ${res.status}`);
      if (!res.ok) { this.onError(new Error(`regressa ingest ${res.status}: ${await res.text()}`)); }
    } catch (err) {
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 250 * 2 ** attempt));
        return this.send(traces, attempt + 1);
      }
      this.onError(err);
    }
  }
}

function isTimeout(err: unknown): boolean {
  const m = err instanceof Error ? err.message.toLowerCase() : "";
  return m.includes("timeout") || m.includes("timed out") || (err as { name?: string })?.name === "AbortError";
}

function randomUUID(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}
