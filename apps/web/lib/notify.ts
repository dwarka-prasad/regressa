import { createHmac } from "node:crypto";

export interface TestResult { ok: boolean; error?: string }

/** Build the outbound payload for a channel. Exported for tests. */
export function buildTestPayload(channel: string, ctx: { ruleName: string; projectName: string; url: string }) {
  const title = `Regressa test: ${ctx.ruleName}`;
  if (channel === "slack") return { text: `${title} (project ${ctx.projectName})`, blocks: [{ type: "section", text: { type: "mrkdwn", text: `*${title}*` } }, { type: "section", text: { type: "mrkdwn", text: `Channel wiring works for project *${ctx.projectName}*.` } }] };
  return { type: "regressa.alert.test", rule: { name: ctx.ruleName }, project: { name: ctx.projectName }, message: "Channel wiring works.", url: ctx.url, created_at: new Date().toISOString() };
}

export function signPayload(payload: string, secret: string) {
  return "sha256=" + createHmac("sha256", secret).update(payload).digest("hex");
}

export async function sendTestNotification(channel: string, cfg: Record<string, string>, ctx: { ruleName: string; projectName: string }, fetchImpl: typeof fetch = fetch): Promise<TestResult> {
  const url = channel === "slack" ? cfg.webhook_url : channel === "webhook" ? cfg.url : undefined;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3100";
  if (channel === "email") return { ok: false, error: "email delivery is not configured (SMTP_URL)" };
  if (!url) return { ok: false, error: "channel_config missing url" };
  const body = JSON.stringify(buildTestPayload(channel, { ...ctx, url: `${appUrl}/alerts` }));
  const headers: Record<string, string> = { "Content-Type": "application/json", "User-Agent": "regressa-alerts/0.1" };
  if (channel === "webhook" && cfg.secret) headers["X-Regressa-Signature"] = signPayload(body, cfg.secret);
  try {
    const res = await fetchImpl(url, { method: "POST", headers, body, signal: AbortSignal.timeout(8000) });
    return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
