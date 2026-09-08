import { z } from "zod";

/** A redaction rule: regex source (no flags needed, always global+case-insensitive) and replacement token. */
export const RedactionRuleSchema = z.object({
  name: z.string().min(1).max(60),
  pattern: z.string().min(1).max(500),
  replacement: z.string().max(60).default("[REDACTED]"),
});
export type RedactionRule = z.infer<typeof RedactionRuleSchema>;
export const RedactionRulesSchema = z.array(RedactionRuleSchema).max(50);

/** Built-in presets users can enable with one click. Patterns are deliberately conservative. */
export const REDACTION_PRESETS: RedactionRule[] = [
  { name: "email", pattern: "[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}", replacement: "[EMAIL]" },
  { name: "phone", pattern: "(?<!\\d)(?:\\+?\\d{1,3}[ .-]?)?\\(?\\d{3}\\)?[ .-]?\\d{3}[ .-]?\\d{4}(?!\\d)", replacement: "[PHONE]" },
  { name: "credit_card", pattern: "(?<!\\d)(?:\\d[ -]?){13,19}(?!\\d)", replacement: "[CARD]" },
  { name: "ssn", pattern: "(?<!\\d)\\d{3}-\\d{2}-\\d{4}(?!\\d)", replacement: "[SSN]" },
  { name: "ipv4", pattern: "(?<!\\d)(?:\\d{1,3}\\.){3}\\d{1,3}(?!\\d)", replacement: "[IP]" },
  { name: "api_key", pattern: "\\b(?:sk|rgsa|ghp|xox[bpa])[-_][A-Za-z0-9_-]{16,}\\b", replacement: "[SECRET]" },
];

const cache = new Map<string, RegExp | null>();
function compile(rule: RedactionRule): RegExp | null {
  const key = rule.pattern;
  if (cache.has(key)) return cache.get(key)!;
  let re: RegExp | null;
  try { re = new RegExp(rule.pattern, "giu"); } catch { re = null; }
  cache.set(key, re);
  return re;
}

/** Apply rules to a string. Invalid patterns are skipped, never thrown. */
export function redactText(text: string, rules: RedactionRule[]): string {
  let out = text;
  for (const rule of rules) {
    const re = compile(rule);
    if (re) out = out.replace(re, rule.replacement);
  }
  return out;
}

/** Deep-apply redaction to any JSON value (messages, content blocks, metadata). */
export function redactValue<T>(value: T, rules: RedactionRule[]): T {
  if (rules.length === 0) return value;
  if (typeof value === "string") return redactText(value, rules) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => redactValue(v, rules)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = redactValue(v, rules);
    return out as T;
  }
  return value;
}
