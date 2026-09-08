import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getCtx } from "@/lib/current";
import { db, schema } from "@/lib/db";
import { PassBadge, ProviderBadge, StatusBadge, VersionBadge } from "@/components/Badges";
import { CopyButton } from "@/components/CopyButton";
import { fmtMs, fmtTime, fmtUsd } from "@/lib/format";

export default async function TracePage({ params, searchParams }: { params: { id: string }; searchParams: { at?: string } }) {
  const { project } = await getCtx();
  const d = db();
  const where = and(eq(schema.traces.id, params.id), eq(schema.traces.projectId, project.id), searchParams.at ? eq(schema.traces.createdAt, new Date(searchParams.at)) : undefined);
  const [row] = await d.select({ t: schema.traces, version: schema.promptVersions, template: schema.promptTemplates }).from(schema.traces)
    .leftJoin(schema.promptVersions, eq(schema.promptVersions.id, schema.traces.promptVersionId))
    .leftJoin(schema.promptTemplates, eq(schema.promptTemplates.id, schema.promptVersions.promptTemplateId))
    .where(where).limit(1);
  if (!row) notFound();
  const { t, version, template } = row;
  const evals = await d.select({ r: schema.evalResults, def: schema.evalDefinitions }).from(schema.evalResults)
    .innerJoin(schema.evalDefinitions, eq(schema.evalDefinitions.id, schema.evalResults.evalDefinitionId)).where(eq(schema.evalResults.traceId, t.id));
  const messages = (Array.isArray(t.inputMessages) ? t.inputMessages : []) as { role: string; content: unknown }[];
  const asJson = JSON.stringify({ id: t.id, model: t.model, provider: t.provider, input_messages: t.inputMessages, output_text: t.outputText, status: t.status, latency_ms: t.latencyMs, prompt_tokens: t.promptTokens, completion_tokens: t.completionTokens, total_cost_usd: t.totalCostUsd, metadata: t.metadata, created_at: t.createdAt }, null, 2);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-muted"><Link href="/traces" className="link">Traces</Link> <span className="mx-1">/</span> <span className="mono">{t.id}</span></div>
        <div className="flex gap-2"><Link className="btn-primary btn-sm" href={`/playground?trace=${t.id}&at=${t.createdAt.toISOString()}`}>Replay in playground</Link><CopyButton text={t.id} label="Copy id" /><CopyButton text={asJson} label="Copy JSON" /></div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <div className="card py-3"><div className="label">Status</div><StatusBadge status={t.status} /></div>
        <div className="card py-3"><div className="label">Model</div><div className="flex items-center gap-1.5"><ProviderBadge provider={t.provider} /><span className="mono">{t.model}</span></div></div>
        <div className="card py-3"><div className="label">Latency</div><div className="text-sm font-medium tabular-nums">{fmtMs(t.latencyMs)}</div></div>
        <div className="card py-3"><div className="label">Cost</div><div className="text-sm font-medium tabular-nums">{fmtUsd(t.totalCostUsd)}</div></div>
        <div className="card py-3"><div className="label">Tokens</div><div className="text-sm font-medium tabular-nums">{t.promptTokens ?? "-"} in · {t.completionTokens ?? "-"} out</div></div>
      </div>
      {template && version && (
        <div className="card flex flex-wrap items-center gap-3 py-3 text-sm">
          <span className="label mb-0">Template</span>
          <Link href={`/prompts/${template.id}`} className="link font-medium">{template.name}</Link>
          <VersionBadge n={version.versionNumber} />
          <span className="mono text-muted">sha256 {version.contentHash.slice(0, 16)}</span>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <div className="mb-3 card-title">Input</div>
          <div className="space-y-2">
            {messages.map((m, i) => (
              <div key={i} className={`rounded-xl border p-3 text-sm ${m.role === "system" ? "border-brand/20 bg-brand-soft/40" : m.role === "user" ? "border-line bg-surface-2" : "border-line"}`}>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{m.role}</div>
                <pre className="whitespace-pre-wrap break-words font-sans">{typeof m.content === "string" ? m.content : JSON.stringify(m.content, null, 2)}</pre>
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <div className="card">
            <div className="mb-3 card-title">Output</div>
            {t.status === "success" ? <pre className="whitespace-pre-wrap break-words rounded-xl border border-line bg-surface-2 p-3 font-sans text-sm">{t.outputText}</pre>
              : <pre className="whitespace-pre-wrap break-words rounded-xl border border-bad/30 bg-bad/5 p-3 text-xs text-bad">{t.errorMessage}</pre>}
          </div>
          <div className="card">
            <div className="mb-3 card-title">Evals</div>
            {evals.length === 0 ? <p className="text-sm text-muted">No evals ran on this trace (check sample rate and template scope).</p> : (
              <ul className="space-y-2 text-sm">
                {evals.map(({ r, def }) => (
                  <li key={r.id} className="rounded-xl border border-line p-3">
                    <div className="flex items-center justify-between"><span className="font-medium">{def.name}</span><span className="flex items-center gap-2 tabular-nums"><span className="mono">{r.score}</span><PassBadge passed={r.passed} /></span></div>
                    {r.reasoning && <p className="mt-1 text-muted">{r.reasoning}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="card">
            <div className="mb-2 card-title">Metadata</div>
            <pre className="overflow-x-auto rounded-xl bg-surface-2 p-3 text-xs">{JSON.stringify(t.metadata, null, 2)}</pre>
            <div className="mt-2 text-xs text-muted">Recorded {fmtTime(t.createdAt)}{t.traceGroupId && <> · group <span className="mono">{t.traceGroupId}</span></>}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
