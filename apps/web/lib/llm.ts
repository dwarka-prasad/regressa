import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { estimateCostUsd } from "@regressa/shared-types";

export interface Message { role: string; content: string }
export interface RunResult { output: string; model: string; provider: "openai" | "anthropic"; latencyMs: number; promptTokens?: number; completionTokens?: number; costUsd: number | null }

export const PLAYGROUND_MODELS: { id: string; provider: "openai" | "anthropic"; label: string }[] = [
  { id: "claude-sonnet-5", provider: "anthropic", label: "Claude Sonnet 5" },
  { id: "claude-haiku-4-5-20251001", provider: "anthropic", label: "Claude Haiku 4.5" },
  { id: "claude-opus-5", provider: "anthropic", label: "Claude Opus 5" },
  { id: "gpt-4o-mini", provider: "openai", label: "GPT-4o mini" },
  { id: "gpt-4o", provider: "openai", label: "GPT-4o" },
  { id: "gpt-4.1", provider: "openai", label: "GPT-4.1" },
];

export function providerFor(model: string): "openai" | "anthropic" {
  return PLAYGROUND_MODELS.find((m) => m.id === model)?.provider ?? (model.startsWith("claude") ? "anthropic" : "openai");
}
export function providerConfigured(provider: "openai" | "anthropic") {
  return provider === "openai" ? !!process.env.OPENAI_API_KEY : !!process.env.ANTHROPIC_API_KEY;
}

/** Run a chat completion server-side with the dashboard's provider keys (used by the playground). */
export async function runChat(model: string, messages: Message[], maxTokens = 1024): Promise<RunResult> {
  const provider = providerFor(model);
  if (!providerConfigured(provider)) throw new Error(`${provider === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY"} is not set on the dashboard server`);
  const started = Date.now();
  if (provider === "anthropic") {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const rest = messages.filter((m) => m.role !== "system").map((m) => ({ role: (m.role === "assistant" ? "assistant" : "user") as "user" | "assistant", content: m.content }));
    const res = await client.messages.create({ model, max_tokens: maxTokens, system: system || undefined, messages: rest.length ? rest : [{ role: "user", content: "" }] });
    const output = res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
    return { output, model: res.model, provider, latencyMs: Date.now() - started, promptTokens: res.usage.input_tokens, completionTokens: res.usage.output_tokens, costUsd: estimateCostUsd(res.model, res.usage.input_tokens, res.usage.output_tokens) };
  }
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const res = await client.chat.completions.create({ model, max_tokens: maxTokens, messages: messages.map((m) => ({ role: m.role as "system" | "user" | "assistant", content: m.content })) });
  const output = res.choices[0]?.message?.content ?? "";
  return { output, model: res.model, provider, latencyMs: Date.now() - started, promptTokens: res.usage?.prompt_tokens, completionTokens: res.usage?.completion_tokens, costUsd: estimateCostUsd(res.model, res.usage?.prompt_tokens, res.usage?.completion_tokens) };
}

/** Flatten stored input_messages (string or content-block arrays) into plain text messages for replay. */
export function toPlainMessages(input: unknown): Message[] {
  if (!Array.isArray(input)) return [];
  return input.map((m) => {
    const msg = m as { role?: string; content?: unknown };
    const c = msg.content;
    const text = typeof c === "string" ? c : Array.isArray(c) ? c.map((b) => (typeof b === "string" ? b : b && typeof b === "object" && "text" in b ? String((b as { text: unknown }).text) : "")).join("") : JSON.stringify(c ?? "");
    return { role: msg.role ?? "user", content: text };
  });
}
