import type { Message, PromptTemplateRef } from "./types.js";

/**
 * Infer a prompt template from the system message when the caller didn't declare one.
 * Heuristic: the system prompt is the template; interpolated values are usually in user turns.
 * Callers get far better version tracking by passing { promptTemplate: { name, raw } } explicitly.
 */
export function inferTemplate(messages: Message[], system?: unknown): PromptTemplateRef | undefined {
  const sys = typeof system === "string" ? system : contentToText(messages.find((m) => m.role === "system")?.content);
  if (!sys) return undefined;
  return { name: `system:${fnv1a(sys).slice(0, 8)}`, raw: sys };
}

export function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((b) => (typeof b === "string" ? b : b && typeof b === "object" && "text" in b ? String((b as { text: unknown }).text) : "")).join("");
  }
  return "";
}

function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}
