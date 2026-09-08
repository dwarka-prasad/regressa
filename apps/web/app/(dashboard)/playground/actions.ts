"use server";
import { getCtx } from "@/lib/current";
import { audit } from "@/lib/audit";
import { runChat, type Message, type RunResult } from "@/lib/llm";

export interface PlaygroundState { result?: RunResult; error?: string; messages?: Message[]; model?: string }

export async function runPlayground(_prev: PlaygroundState | undefined, form: FormData): Promise<PlaygroundState> {
  const { org, project, user } = await getCtx();
  const model = String(form.get("model") ?? "");
  const system = String(form.get("system") ?? "").trim();
  const userMsg = String(form.get("user") ?? "").trim();
  const messages: Message[] = [...(system ? [{ role: "system", content: system }] : []), { role: "user", content: userMsg }];
  if (!model || !userMsg) return { error: "Pick a model and enter a user message.", messages, model };
  try {
    const result = await runChat(model, messages);
    await audit({ orgId: org.id, projectId: project.id, userId: user.id, email: user.email }, "playground.run", model, { latency_ms: result.latencyMs, cost_usd: result.costUsd });
    return { result, messages, model };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err), messages, model };
  }
}
