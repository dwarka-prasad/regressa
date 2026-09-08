"use client";
import { useFormState, useFormStatus } from "react-dom";
import { runPlayground, type PlaygroundState } from "./actions";

interface Original { model: string; output: string | null; system: string; user: string; latencyMs: number | null; costUsd: string | null; templateName?: string | null }

function Run() {
  const { pending } = useFormStatus();
  return <button className="btn-primary" type="submit" disabled={pending}>{pending ? "Running..." : "Run"}</button>;
}

export function PlaygroundForm({ models, original }: { models: { id: string; label: string; provider: string; available: boolean }[]; original: Original | null }) {
  const [state, action] = useFormState(runPlayground, undefined);
  const anyAvailable = models.some((m) => m.available);
  const defaultModel = models.find((m) => m.id === original?.model && m.available)?.id ?? models.find((m) => m.available)?.id ?? models[0]?.id;
  const r = state?.result;
  const fmtCost = (v: number | string | null | undefined) => (v == null ? "-" : `$${Number(v).toFixed(5)}`);
  const delta = (cur?: number | null, base?: number | null) => cur != null && base != null && base > 0 ? `${cur >= base ? "+" : ""}${(((cur - base) / base) * 100).toFixed(0)}%` : "";

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <form action={action} className="card space-y-3 self-start">
        {!anyAvailable && <div className="rounded-lg bg-warn/10 px-3 py-2 text-sm text-warn">No provider keys on the dashboard server. Set OPENAI_API_KEY or ANTHROPIC_API_KEY in .env and restart.</div>}
        <div><label className="label">Model</label>
          <select className="input" name="model" defaultValue={defaultModel}>
            {models.map((m) => <option key={m.id} value={m.id} disabled={!m.available}>{m.label}{m.available ? "" : " (no key)"}</option>)}
          </select></div>
        <div><label className="label">System prompt {original?.templateName && <span className="ml-1 normal-case text-muted">from template {original.templateName}</span>}</label>
          <textarea className="input font-mono text-xs" name="system" rows={8} defaultValue={state?.messages?.find((m) => m.role === "system")?.content ?? original?.system ?? ""} placeholder="You are a support agent for Acme. Be concise." /></div>
        <div><label className="label">User message</label>
          <textarea className="input" name="user" rows={4} defaultValue={state?.messages?.find((m) => m.role === "user")?.content ?? original?.user ?? ""} placeholder="How do I reset my password?" /></div>
        {state?.error && <p className="rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">{state.error}</p>}
        <div className="flex items-center justify-between"><span className="text-xs text-muted">Not stored as a trace. Costs are billed to your provider account.</span><Run /></div>
      </form>

      <div className="space-y-4">
        {original && (
          <div className="card">
            <div className="mb-2 flex items-center justify-between"><div className="card-title">Original</div><span className="badge-muted">{original.model}</span></div>
            <pre className="whitespace-pre-wrap break-words rounded-xl bg-surface-2 p-3 font-sans text-sm">{original.output ?? "(no output)"}</pre>
            <div className="mt-2 flex gap-4 text-xs text-muted"><span>{original.latencyMs ?? "-"}ms</span><span>{fmtCost(original.costUsd)}</span></div>
          </div>
        )}
        <div className="card min-h-40">
          <div className="mb-2 flex items-center justify-between"><div className="card-title">{original ? "Replay" : "Result"}</div>{r && <span className="badge-brand">{r.model}</span>}</div>
          {r ? (
            <>
              <pre className="whitespace-pre-wrap break-words rounded-xl border border-brand/20 bg-brand-soft/30 p-3 font-sans text-sm">{r.output || "(empty)"}</pre>
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                <div><div className="label">Latency</div>{r.latencyMs}ms {original && <span className={r.latencyMs > (original.latencyMs ?? 0) ? "text-bad" : "text-ok"}>{delta(r.latencyMs, original.latencyMs)}</span>}</div>
                <div><div className="label">Tokens</div>{r.promptTokens ?? "-"} in / {r.completionTokens ?? "-"} out</div>
                <div><div className="label">Cost</div>{fmtCost(r.costUsd)} {original && r.costUsd != null && <span className={r.costUsd > Number(original.costUsd ?? 0) ? "text-bad" : "text-ok"}>{delta(r.costUsd, original.costUsd == null ? null : Number(original.costUsd))}</span>}</div>
              </div>
            </>
          ) : <p className="text-sm text-muted">Run the prompt to see the response here{original ? " next to the original" : ""}.</p>}
        </div>
      </div>
    </div>
  );
}
