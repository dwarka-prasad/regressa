/** Kept dependency-free: the SDK must not pull in zod or workspace packages. Mirrors @regressa/shared-types. */
export type Provider = "openai" | "anthropic" | "other";
export type TraceStatus = "success" | "error" | "timeout";

export interface Message { role: string; content: unknown; name?: string }

export interface PromptTemplateRef { name: string; raw: string }

export interface TraceInput {
  id?: string;
  timestamp?: string;
  model: string;
  provider: Provider;
  input_messages: Message[];
  output_text?: string | null;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_cost_usd?: number;
  latency_ms?: number;
  status?: TraceStatus;
  error_message?: string;
  trace_group_id?: string;
  prompt_template?: PromptTemplateRef;
  metadata?: Record<string, unknown>;
}

export interface RegressaOptions {
  /** rgsa_live_… or rgsa_test_… — defaults to process.env.REGRESSA_API_KEY */
  apiKey?: string;
  /** Ingestion base URL — defaults to process.env.REGRESSA_BASE_URL or https://ingest.regressa.dev */
  baseUrl?: string;
  /** Max traces buffered before a flush. Default 50. */
  flushAt?: number;
  /** Max ms a trace sits in the buffer before a flush. Default 2000. */
  flushIntervalMs?: number;
  /** Disable sending (still calls wrappers transparently). Default false. */
  disabled?: boolean;
  /** Redact message contents before sending. Return the replacement content. */
  redact?: (messages: Message[]) => Message[];
  /** Attach metadata to every trace (e.g. { env: "prod", service: "api" }). */
  defaultMetadata?: Record<string, unknown>;
  /** Called on transport errors. Default: console.warn once. */
  onError?: (err: unknown) => void;
  fetch?: typeof fetch;
}

/** Per-call options passed as the second arg of wrapped create() or via the `regressa` key. */
export interface CallOptions {
  /** Template name + raw template. Lets Regressa track prompt versions for this call. */
  promptTemplate?: PromptTemplateRef;
  traceGroupId?: string;
  metadata?: Record<string, unknown>;
}
