import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { getCtx } from "@/lib/current";
import { db, schema } from "@/lib/db";
import { versionStats } from "@/lib/queries";
import { diffLines, diffStats } from "@/lib/diff";
import { PageHeader } from "@/components/PageHeader";
import { VersionBadge } from "@/components/Badges";
import { fmtMs, fmtPct, fmtScore, fmtTime, fmtUsd } from "@/lib/format";

export default async function PromptDetail({ params, searchParams }: { params: { id: string }; searchParams: { compare?: string } }) {
  const { project } = await getCtx();
  const d = db();
  const [tpl] = await d.select().from(schema.promptTemplates).where(and(eq(schema.promptTemplates.id, params.id), eq(schema.promptTemplates.projectId, project.id))).limit(1);
  if (!tpl) notFound();
  const [stats, versions] = await Promise.all([
    versionStats(tpl.id),
    d.select().from(schema.promptVersions).where(eq(schema.promptVersions.promptTemplateId, tpl.id)).orderBy(desc(schema.promptVersions.versionNumber)),
  ]);
  const latest = versions[0];
  const compareTo = versions.find((v) => String(v.versionNumber) === searchParams.compare) ?? versions[1];
  const ops = latest && compareTo ? diffLines(compareTo.rawTemplate, latest.rawTemplate) : [];
  const ds = diffStats(ops);

  const Delta = ({ cur, prev, lowerIsBetter }: { cur: number | null | undefined; prev: number | null | undefined; lowerIsBetter: boolean }) => {
    if (cur == null || prev == null || prev === 0) return null;
    const pct = ((cur - prev) / prev) * 100;
    if (Math.abs(pct) < 0.05) return null;
    const bad = lowerIsBetter ? pct > 0 : pct < 0;
    return <span className={`ml-1.5 text-xs tabular-nums ${bad ? "text-bad" : "text-ok"}`}>{pct > 0 ? "+" : ""}{pct.toFixed(1)}%</span>;
  };

  return (
    <div className="space-y-5">
      <div className="text-sm text-muted"><Link href="/prompts" className="link">Prompts</Link> <span className="mx-1">/</span> {tpl.name}</div>
      <PageHeader title={tpl.name} description={`${versions.length} version${versions.length === 1 ? "" : "s"} · deltas compare each version with the one before it (last 30 days)`} />
      <div className="card overflow-x-auto p-0">
        <table className="data">
          <thead><tr><th>Version</th><th>First seen</th><th className="text-right">Requests</th><th className="text-right">Eval score</th><th className="text-right">p95 latency</th><th className="text-right">Error rate</th><th className="text-right">Cost</th></tr></thead>
          <tbody>
            {stats.map((s, i) => {
              const prev = stats[i + 1];
              return (
                <tr key={s.version_id}>
                  <td><VersionBadge n={s.version_number} current={i === 0} /></td>
                  <td className="whitespace-nowrap text-muted">{fmtTime(s.first_seen_at)}</td>
                  <td className="text-right tabular-nums">{s.request_count}</td>
                  <td className="text-right tabular-nums">{fmtScore(s.avg_eval_score)}<Delta cur={s.avg_eval_score} prev={prev?.avg_eval_score} lowerIsBetter={false} /><span className="ml-1 text-xs text-muted">({s.eval_count})</span></td>
                  <td className="text-right tabular-nums">{fmtMs(s.p95_latency_ms)}<Delta cur={s.p95_latency_ms} prev={prev?.p95_latency_ms} lowerIsBetter /></td>
                  <td className="text-right tabular-nums">{fmtPct(s.error_rate)}<Delta cur={s.error_rate} prev={prev?.error_rate} lowerIsBetter /></td>
                  <td className="text-right tabular-nums">{fmtUsd(s.total_cost, 2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {latest && compareTo && (
        <div className="card">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="card-title">Diff: v{compareTo.versionNumber} to v{latest.versionNumber} <span className="ml-2 text-xs font-normal text-ok">+{ds.added}</span> <span className="text-xs font-normal text-bad">-{ds.removed}</span></div>
            <form className="flex items-center gap-2 text-xs" action={`/prompts/${tpl.id}`}>
              <span className="text-muted">Compare current with</span>
              <select className="input w-auto py-1" name="compare" defaultValue={String(compareTo.versionNumber)}>{versions.slice(1).map((v) => <option key={v.id} value={v.versionNumber}>v{v.versionNumber}</option>)}</select>
              <button className="btn-ghost btn-sm" type="submit">Go</button>
            </form>
          </div>
          <pre className="overflow-x-auto rounded-xl border border-line text-xs leading-relaxed">
            {ops.map((o, i) => (
              <div key={i} className={`px-3 ${o.type === "add" ? "bg-ok/10 text-ok" : o.type === "del" ? "bg-bad/10 text-bad line-through decoration-bad/40" : ""}`}>
                <span className="mr-3 inline-block w-3 select-none text-muted">{o.type === "add" ? "+" : o.type === "del" ? "-" : " "}</span>{o.text || " "}
              </div>
            ))}
          </pre>
        </div>
      )}

      <div className="space-y-3">
        {versions.map((v, i) => (
          <details key={v.id} className="card" open={i === 0}>
            <summary className="flex cursor-pointer items-center gap-3 text-sm"><VersionBadge n={v.versionNumber} current={i === 0} /><span className="mono text-muted">{v.contentHash.slice(0, 16)}</span><span className="ml-auto text-xs text-muted">{fmtTime(v.firstSeenAt)}</span></summary>
            <pre className="mt-3 whitespace-pre-wrap break-words rounded-xl bg-surface-2 p-3 text-xs">{v.rawTemplate}</pre>
          </details>
        ))}
      </div>
    </div>
  );
}
