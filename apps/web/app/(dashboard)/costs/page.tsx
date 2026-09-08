import Link from "next/link";
import { getCtx } from "@/lib/current";
import { getRange } from "@/lib/range.server";
import { bucketLabel } from "@/lib/range";
import { costByModel, costByTemplate, series } from "@/lib/queries";
import { TimeSeriesChart } from "@/components/TimeSeriesChart";
import { StatCard } from "@/components/StatCard";
import { PageHeader } from "@/components/PageHeader";
import { ProviderBadge } from "@/components/Badges";
import { fmtInt, fmtMs, fmtUsd } from "@/lib/format";

export default async function CostsPage({ searchParams }: { searchParams: { range?: string } }) {
  const { project, org } = await getCtx();
  const range = getRange(searchParams.range);
  const [byModel, byTemplate, s] = await Promise.all([costByModel(project.id, range.hours), costByTemplate(project.id, range.hours), series(project.id, range.hours, range.bucket)]);
  const total = byModel.reduce((a, r) => a + r.total_cost, 0);
  const reqs = byModel.reduce((a, r) => a + r.request_count, 0);
  const projected = (total / range.hours) * 24 * 30;
  const labels = s.map((b) => bucketLabel(b.bucket, range.key));

  return (
    <div className="space-y-5">
      <PageHeader title="Costs" description={`LLM spend for ${project.name} · last ${range.label}`} actions={<Link href="/settings#billing" className="btn-ghost btn-sm">Plan: {org.plan}</Link>} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Spend" value={fmtUsd(total, 2)} hint={`${fmtInt(reqs)} requests`} />
        <StatCard label="Avg cost / request" value={fmtUsd(reqs ? total / reqs : 0, 5)} hint="across all models" />
        <StatCard label="Projected 30d" value={fmtUsd(projected, 2)} hint="linear extrapolation of this range" />
        <StatCard label="Models in use" value={String(byModel.length)} hint={byModel[0] ? `${byModel[0].model} leads` : "none yet"} />
      </div>
      <div className="card">
        <div className="mb-3 card-title">Spend over time</div>
        <TimeSeriesChart labels={labels} kind="bar" series={[{ name: "USD", color: "#0ea5e9", values: s.map((b) => b.total_cost), unit: "usd" }]} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card overflow-x-auto p-0">
          <table className="data">
            <thead><tr><th>Model</th><th className="text-right">Requests</th><th className="text-right">Tokens in / out</th><th className="text-right">Avg latency</th><th className="text-right">Cost</th><th className="text-right">Share</th></tr></thead>
            <tbody>{byModel.map((r) => (
              <tr key={`${r.provider}/${r.model}`}>
                <td><div className="flex items-center gap-1.5"><ProviderBadge provider={r.provider} /><span className="mono">{r.model}</span></div></td>
                <td className="text-right tabular-nums">{fmtInt(r.request_count)}</td>
                <td className="text-right tabular-nums text-muted">{fmtInt(r.prompt_tokens)} / {fmtInt(r.completion_tokens)}</td>
                <td className="text-right tabular-nums">{fmtMs(r.avg_latency_ms)}</td>
                <td className="text-right tabular-nums">{fmtUsd(r.total_cost, 4)}</td>
                <td className="text-right tabular-nums"><span className="inline-block h-1.5 w-16 rounded bg-line align-middle"><span className="block h-full rounded bg-brand" style={{ width: `${total ? (r.total_cost / total) * 100 : 0}%` }} /></span></td>
              </tr>))}
              {byModel.length === 0 && <tr><td colSpan={6} className="text-center text-muted">No traffic in range</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="card overflow-x-auto p-0">
          <table className="data">
            <thead><tr><th>Prompt template</th><th className="text-right">Requests</th><th className="text-right">Cost</th><th className="text-right">Avg / request</th></tr></thead>
            <tbody>{byTemplate.map((r) => (
              <tr key={r.name}>
                <td>{r.template_id ? <Link href={`/prompts/${r.template_id}`} className="link">{r.name}</Link> : <span className="text-muted">{r.name}</span>}</td>
                <td className="text-right tabular-nums">{fmtInt(r.request_count)}</td>
                <td className="text-right tabular-nums">{fmtUsd(r.total_cost, 4)}</td>
                <td className="text-right tabular-nums text-muted">{fmtUsd(r.request_count ? r.total_cost / r.request_count : 0, 5)}</td>
              </tr>))}
              {byTemplate.length === 0 && <tr><td colSpan={4} className="text-center text-muted">No traffic in range</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
