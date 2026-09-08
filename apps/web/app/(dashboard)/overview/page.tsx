import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getCtx } from "@/lib/current";
import { db, schema } from "@/lib/db";
import { getRange } from "@/lib/range.server";
import { bucketLabel } from "@/lib/range";
import { onboardingState, recentVersionChanges, series, totals } from "@/lib/queries";
import { StatCard } from "@/components/StatCard";
import { TimeSeriesChart } from "@/components/TimeSeriesChart";
import { Onboarding } from "@/components/Onboarding";
import { PageHeader } from "@/components/PageHeader";
import { VersionBadge } from "@/components/Badges";
import { fmtInt, fmtMs, fmtPct, fmtScore, fmtUsd, ago } from "@/lib/format";

export default async function OverviewPage({ searchParams }: { searchParams: { range?: string } }) {
  const { project } = await getCtx();
  const range = getRange(searchParams.range);
  const [cur, prev, s, events, changes, onboarding] = await Promise.all([
    totals(project.id, range.hours),
    totals(project.id, range.hours, range.hours),
    series(project.id, range.hours, range.bucket),
    db().select({ ev: schema.alertEvents, rule: schema.alertRules }).from(schema.alertEvents)
      .innerJoin(schema.alertRules, eq(schema.alertRules.id, schema.alertEvents.alertRuleId))
      .where(eq(schema.alertEvents.projectId, project.id)).orderBy(desc(schema.alertEvents.createdAt)).limit(6),
    recentVersionChanges(project.id, 6),
    onboardingState(project.id),
  ]);
  const labels = s.map((b) => bucketLabel(b.bucket, range.key));

  return (
    <div className="space-y-5">
      <PageHeader title="Overview" description={`${project.name} · last ${range.label}`} />
      <Onboarding state={onboarding} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Requests" value={fmtInt(cur.request_count)} current={cur.request_count} prev={prev.request_count} series={s.map((b) => b.request_count)} />
        <StatCard label="Cost" value={fmtUsd(cur.total_cost, 2)} current={cur.total_cost} prev={prev.total_cost} lowerIsBetter series={s.map((b) => b.total_cost)} />
        <StatCard label="p95 latency" value={fmtMs(cur.p95_latency_ms)} current={cur.p95_latency_ms} prev={prev.p95_latency_ms} lowerIsBetter series={s.map((b) => b.p95_latency_ms)} />
        <StatCard label="Error rate" value={fmtPct(cur.error_rate)} current={cur.error_rate} prev={prev.error_rate} lowerIsBetter series={s.map((b) => b.error_count)} />
        <StatCard label="Eval score" value={fmtScore(cur.avg_eval_score)} current={cur.avg_eval_score ?? undefined} prev={prev.avg_eval_score ?? undefined} hint={cur.eval_count ? `${cur.eval_count} evals scored` : "no evals scored yet"} series={s.map((b) => b.avg_eval_score ?? 0)} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <div className="mb-3 flex items-center justify-between"><div className="card-title">Traffic and errors</div><span className="text-xs text-muted">per {range.bucket}</span></div>
          <TimeSeriesChart labels={labels} series={[
            { name: "Requests", color: "rgb(var(--brand))", values: s.map((b) => b.request_count) },
            { name: "Errors", color: "rgb(var(--bad))", values: s.map((b) => b.error_count) },
          ]} />
        </div>
        <div className="card">
          <div className="mb-3 card-title">Eval score</div>
          <TimeSeriesChart labels={labels} series={[{ name: "Avg score", color: "rgb(var(--ok))", values: s.map((b) => b.avg_eval_score ?? 0), unit: "score" }]} />
        </div>
        <div className="card">
          <div className="mb-3 card-title">Cost</div>
          <TimeSeriesChart labels={labels} kind="bar" series={[{ name: "USD", color: "#0ea5e9", values: s.map((b) => b.total_cost), unit: "usd" }]} />
        </div>
        <div className="card lg:col-span-2">
          <div className="mb-3 card-title">Latency</div>
          <TimeSeriesChart labels={labels} series={[
            { name: "p95", color: "rgb(var(--warn))", values: s.map((b) => b.p95_latency_ms), unit: "ms" },
            { name: "avg", color: "rgb(var(--muted))", values: s.map((b) => b.avg_latency_ms), unit: "ms" },
          ]} />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <div className="mb-3 flex items-center justify-between"><div className="card-title">Recent alerts</div><Link className="link text-xs" href="/alerts">View all</Link></div>
          {events.length === 0 ? <p className="text-sm text-muted">Nothing has fired. Rules are evaluated every minute.</p> : (
            <ul className="divide-y divide-line/70">
              {events.map(({ ev, rule }) => (
                <li key={ev.id} className="flex items-start gap-3 py-2.5 text-sm">
                  <span className={`dot mt-1.5 ${ev.status === "open" ? "bg-bad" : ev.status === "acknowledged" ? "bg-warn" : "bg-ok"}`} />
                  <div className="min-w-0 flex-1"><Link href={`/alerts/${ev.id}`} className="font-medium hover:underline">{rule.name}</Link><div className="truncate text-muted">{ev.message}</div></div>
                  <span className="shrink-0 text-xs text-muted">{ago(ev.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card">
          <div className="mb-3 flex items-center justify-between"><div className="card-title">Prompt changes</div><Link className="link text-xs" href="/prompts">All templates</Link></div>
          {changes.length === 0 ? <p className="text-sm text-muted">No prompt versions detected yet. Pass <code>promptTemplate</code> from the SDK.</p> : (
            <ul className="divide-y divide-line/70">
              {changes.map((c) => (
                <li key={c.versionId} className="flex items-center gap-3 py-2.5 text-sm">
                  <VersionBadge n={c.versionNumber} />
                  <Link href={`/prompts/${c.templateId}`} className="flex-1 truncate font-medium hover:underline">{c.templateName}</Link>
                  <span className="text-xs text-muted">{ago(c.firstSeenAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
