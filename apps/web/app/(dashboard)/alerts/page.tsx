import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getCtx } from "@/lib/current";
import { db, schema } from "@/lib/db";
import { createRule, deleteRule, setEventStatus, testRule, toggleRule } from "./actions";
import { PageHeader } from "@/components/PageHeader";
import { ago } from "@/lib/format";

const METRIC_LABEL: Record<string, string> = { eval_score: "Eval score", cost: "Cost", latency_p95: "p95 latency", error_rate: "Error rate", prompt_version_change: "Prompt version change", budget: "Monthly budget" };

export default async function AlertsPage() {
  const { project } = await getCtx();
  const d = db();
  const [rules, events, templates, evals] = await Promise.all([
    d.select().from(schema.alertRules).where(eq(schema.alertRules.projectId, project.id)).orderBy(schema.alertRules.createdAt),
    d.select({ ev: schema.alertEvents, rule: schema.alertRules }).from(schema.alertEvents).innerJoin(schema.alertRules, eq(schema.alertRules.id, schema.alertEvents.alertRuleId))
      .where(eq(schema.alertEvents.projectId, project.id)).orderBy(desc(schema.alertEvents.createdAt)).limit(50),
    d.select().from(schema.promptTemplates).where(eq(schema.promptTemplates.projectId, project.id)),
    d.select().from(schema.evalDefinitions).where(eq(schema.evalDefinitions.projectId, project.id)),
  ]);
  const describe = (r: typeof rules[number]) => r.metric === "prompt_version_change" ? "fires on any new prompt version"
    : r.metric === "budget" ? "fires when monthly spend reaches the project budget (Settings)"
    : `${METRIC_LABEL[r.metric] ?? r.metric} ${r.condition === "pct_change" ? `changes ≥ ${r.threshold}% vs prior window` : r.condition === "anomaly" ? `deviates ≥ ${Number(r.threshold) || 3}σ from its rolling baseline` : `${r.condition === "gt" ? ">" : "<"} ${r.threshold}`} over ${r.windowMinutes}m`;
  const open = events.filter((e) => e.ev.status === "open").length;

  return (
    <div>
      <PageHeader title="Alerts" description={open ? `${open} open alert${open === 1 ? "" : "s"} need attention` : "Rules are evaluated every minute with per-rule cooldowns"} />
      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <section>
            <div className="mb-2 card-title">Rules</div>
            {rules.length === 0 ? <div className="card text-sm text-muted">No rules yet. Start with an eval score drop of 10% and a prompt version change rule.</div> : (
              <div className="card overflow-x-auto p-0">
                <table className="data">
                  <thead><tr><th>Rule</th><th>Channel</th><th>Last fired</th><th></th></tr></thead>
                  <tbody>
                    {rules.map((r) => (
                      <tr key={r.id} className={r.isActive ? "" : "opacity-50"}>
                        <td><div className="font-medium">{r.name}</div><div className="text-xs text-muted">{describe(r)} · cooldown {r.cooldownMinutes}m</div></td>
                        <td><span className="badge-muted">{r.channel}</span></td>
                        <td className="text-muted">{r.lastTriggeredAt ? ago(r.lastTriggeredAt) : "never"}</td>
                        <td className="whitespace-nowrap text-right">
                          <form action={testRule} className="inline"><input type="hidden" name="id" value={r.id} /><button className="btn-ghost btn-sm" title="Send a test notification">Test</button></form>
                          <form action={toggleRule} className="ml-1 inline"><input type="hidden" name="id" value={r.id} /><input type="hidden" name="active" value={String(!r.isActive)} /><button className="btn-ghost btn-sm">{r.isActive ? "Pause" : "Resume"}</button></form>
                          <form action={deleteRule} className="ml-1 inline"><input type="hidden" name="id" value={r.id} /><button className="btn-danger btn-sm">Delete</button></form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <section>
            <div className="mb-2 card-title">Events</div>
            {events.length === 0 ? <div className="card text-sm text-muted">Nothing has fired.</div> : (
              <div className="card divide-y divide-line/70 p-0">
                {events.map(({ ev, rule }) => (
                  <div key={ev.id} className="flex items-start gap-3 p-4 text-sm">
                    <span className={`dot mt-1.5 ${ev.status === "open" ? "bg-bad" : ev.status === "acknowledged" ? "bg-warn" : "bg-ok"}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2"><Link href={`/alerts/${ev.id}`} className="font-medium hover:underline">{rule.name}</Link>
                        <span className={ev.status === "open" ? "badge-bad" : ev.status === "acknowledged" ? "badge-warn" : "badge-ok"}>{ev.status}</span>
                        {ev.notifyError && <span className="badge-bad" title={ev.notifyError}>notify failed</span>}
                      </div>
                      <div className="text-muted">{ev.message}</div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-xs text-muted">{ago(ev.createdAt)}</span>
                      {ev.status !== "resolved" && (
                        <form action={setEventStatus}><input type="hidden" name="id" value={ev.id} /><input type="hidden" name="status" value={ev.status === "open" ? "acknowledged" : "resolved"} />
                          <button className="btn-ghost btn-sm">{ev.status === "open" ? "Acknowledge" : "Resolve"}</button></form>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
        <form action={createRule} className="card space-y-3 self-start">
          <div className="card-title">New rule</div>
          <div><label className="label">Name</label><input className="input" name="name" placeholder="Eval score regression" /></div>
          <div><label className="label">Metric</label>
            <select className="input" name="metric" defaultValue="eval_score">
              <option value="eval_score">Eval score</option><option value="cost">Cost (USD in window)</option><option value="latency_p95">p95 latency (ms)</option>
              <option value="error_rate">Error rate (0-1)</option><option value="prompt_version_change">Prompt version change</option><option value="budget">Monthly budget exceeded</option>
            </select></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="label">Condition</label><select className="input" name="condition" defaultValue="pct_change"><option value="pct_change">% change vs prior window</option><option value="anomaly">anomaly (z-score vs 24 windows)</option><option value="gt">greater than</option><option value="lt">less than</option></select></div>
            <div><label className="label">Threshold</label><input className="input" name="threshold" type="number" step="any" defaultValue="10" /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="label">Window (min)</label><input className="input" name="window_minutes" type="number" defaultValue="60" /></div>
            <div><label className="label">Cooldown (min)</label><input className="input" name="cooldown_minutes" type="number" defaultValue="60" /></div>
          </div>
          <div><label className="label">Template scope</label><select className="input" name="prompt_template_id" defaultValue=""><option value="">All templates</option>{templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
          <div><label className="label">Eval scope</label><select className="input" name="eval_definition_id" defaultValue=""><option value="">All evals</option>{evals.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
          <div><label className="label">Channel</label><select className="input" name="channel" defaultValue="slack"><option value="slack">Slack incoming webhook</option><option value="webhook">Webhook (HMAC signed)</option><option value="email">Email</option></select></div>
          <div><label className="label">Target URL or email</label><input className="input" name="target" required placeholder="https://hooks.slack.com/..." /></div>
          <div><label className="label">Webhook signing secret (optional)</label><input className="input" name="secret" /></div>
          <button className="btn-primary w-full" type="submit">Create rule</button>
        </form>
      </div>
    </div>
  );
}
