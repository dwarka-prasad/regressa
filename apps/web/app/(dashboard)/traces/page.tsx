import Link from "next/link";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { getCtx } from "@/lib/current";
import { db, schema } from "@/lib/db";
import { getRange } from "@/lib/range.server";
import { PageHeader } from "@/components/PageHeader";
import { ProviderBadge, StatusBadge, VersionBadge } from "@/components/Badges";
import { Empty } from "@/components/Empty";
import { fmtMs, fmtUsd, ago } from "@/lib/format";

const PAGE = 50;

export default async function TracesPage({ searchParams }: { searchParams: { status?: string; model?: string; template?: string; q?: string; page?: string; range?: string } }) {
  const { project } = await getCtx();
  const range = getRange(searchParams.range);
  const page = Math.max(1, Number(searchParams.page ?? 1));
  const q = searchParams.q?.trim();
  const where = and(
    eq(schema.traces.projectId, project.id),
    sql`${schema.traces.createdAt} >= now() - make_interval(hours => ${range.hours})`,
    searchParams.status ? eq(schema.traces.status, searchParams.status) : undefined,
    searchParams.model ? eq(schema.traces.model, searchParams.model) : undefined,
    searchParams.template ? eq(schema.promptTemplates.name, searchParams.template) : undefined,
    q ? or(ilike(schema.traces.outputText, `%${q}%`), ilike(schema.traces.errorMessage, `%${q}%`)) : undefined,
  );
  const [rows, templates, models] = await Promise.all([
    db().select({
      t: schema.traces, templateName: schema.promptTemplates.name, versionNumber: schema.promptVersions.versionNumber,
      evalAvg: sql<number | null>`(SELECT avg(score)::float8 FROM regressa.eval_results er WHERE er.trace_id = ${schema.traces.id})`,
    }).from(schema.traces)
      .leftJoin(schema.promptVersions, eq(schema.promptVersions.id, schema.traces.promptVersionId))
      .leftJoin(schema.promptTemplates, eq(schema.promptTemplates.id, schema.promptVersions.promptTemplateId))
      .where(where).orderBy(desc(schema.traces.createdAt)).limit(PAGE).offset((page - 1) * PAGE),
    db().select({ name: schema.promptTemplates.name }).from(schema.promptTemplates).where(eq(schema.promptTemplates.projectId, project.id)).orderBy(schema.promptTemplates.name),
    db().selectDistinct({ model: schema.traces.model }).from(schema.traces).where(eq(schema.traces.projectId, project.id)),
  ]);

  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams({ ...searchParams, ...patch } as Record<string, string>);
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    return `/traces?${p}`;
  };
  const filtered = Boolean(searchParams.status || searchParams.model || searchParams.template || q);

  return (
    <div>
      <PageHeader title="Traces" description={`Every LLM call in the last ${range.label}`} actions={
        <a className="btn-ghost btn-sm" href="https://docs.regressa.dev/api#traces" target="_blank" rel="noreferrer">Export via API</a>} />
      <form className="card mb-4 flex flex-wrap items-end gap-2 py-3" action="/traces">
        <div className="min-w-48 flex-1"><label className="label">Search</label><input className="input" name="q" placeholder="Output or error text" defaultValue={q} /></div>
        <div><label className="label">Model</label><select className="input w-44" name="model" defaultValue={searchParams.model ?? ""}><option value="">All models</option>{models.map((m) => <option key={m.model} value={m.model}>{m.model}</option>)}</select></div>
        <div><label className="label">Template</label><select className="input w-44" name="template" defaultValue={searchParams.template ?? ""}><option value="">All templates</option>{templates.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}</select></div>
        <div><label className="label">Status</label><select className="input w-32" name="status" defaultValue={searchParams.status ?? ""}><option value="">Any</option><option value="success">success</option><option value="error">error</option><option value="timeout">timeout</option></select></div>
        <button className="btn-primary" type="submit">Apply</button>
        {filtered && <Link className="btn-ghost" href="/traces">Clear</Link>}
      </form>
      {rows.length === 0 ? (
        <Empty title={filtered ? "No traces match these filters" : "No traces in this range"}>{filtered ? "Try widening the time range or clearing filters." : "Wrap your LLM client with the SDK and calls will show up here within seconds."}</Empty>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="data">
            <thead><tr><th>When</th><th>Model</th><th>Template</th><th>Status</th><th className="text-right">Latency</th><th className="text-right">Tokens</th><th className="text-right">Cost</th><th className="text-right">Eval</th><th>Output</th></tr></thead>
            <tbody>
              {rows.map(({ t, templateName, versionNumber, evalAvg }) => (
                <tr key={t.id}>
                  <td className="whitespace-nowrap"><Link className="link" href={`/traces/${t.id}?at=${t.createdAt.toISOString()}`}>{ago(t.createdAt)}</Link></td>
                  <td className="whitespace-nowrap"><div className="flex items-center gap-1.5"><ProviderBadge provider={t.provider} /><span className="mono">{t.model}</span></div></td>
                  <td className="whitespace-nowrap">{templateName ? <span className="flex items-center gap-1.5">{templateName}<VersionBadge n={versionNumber!} /></span> : <span className="text-muted">-</span>}</td>
                  <td><StatusBadge status={t.status} /></td>
                  <td className="text-right tabular-nums">{fmtMs(t.latencyMs)}</td>
                  <td className="whitespace-nowrap text-right tabular-nums text-muted">{t.promptTokens ?? "-"} / {t.completionTokens ?? "-"}</td>
                  <td className="text-right tabular-nums">{fmtUsd(t.totalCostUsd)}</td>
                  <td className="text-right tabular-nums">{evalAvg == null ? <span className="text-muted">-</span> : <span className={Number(evalAvg) < 0.7 ? "text-bad" : "text-ok"}>{Number(evalAvg).toFixed(2)}</span>}</td>
                  <td className="max-w-md truncate text-muted">{t.outputText ?? t.errorMessage ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-3 flex items-center justify-between text-sm text-muted">
        <span>Page {page}</span>
        <div className="flex gap-2">
          {page > 1 && <Link className="btn-ghost btn-sm" href={qs({ page: String(page - 1) })}>Previous</Link>}
          {rows.length === PAGE && <Link className="btn-ghost btn-sm" href={qs({ page: String(page + 1) })}>Next</Link>}
        </div>
      </div>
    </div>
  );
}
