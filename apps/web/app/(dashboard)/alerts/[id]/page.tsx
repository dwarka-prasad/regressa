import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getCtx } from "@/lib/current";
import { db, schema } from "@/lib/db";
import { PageHeader } from "@/components/PageHeader";
import { fmtTime } from "@/lib/format";

export default async function AlertEventPage({ params }: { params: { id: string } }) {
  const { project } = await getCtx();
  const [row] = await db().select({ ev: schema.alertEvents, rule: schema.alertRules }).from(schema.alertEvents)
    .innerJoin(schema.alertRules, eq(schema.alertRules.id, schema.alertEvents.alertRuleId))
    .where(and(eq(schema.alertEvents.id, params.id), eq(schema.alertEvents.projectId, project.id))).limit(1);
  if (!row) notFound();
  const { ev, rule } = row;
  const tone = ev.status === "open" ? "badge-bad" : ev.status === "acknowledged" ? "badge-warn" : "badge-ok";
  return (
    <div className="space-y-4">
      <div className="text-sm text-muted"><Link href="/alerts" className="link">Alerts</Link> <span className="mx-1">/</span> event</div>
      <PageHeader title={rule.name} description={ev.message} actions={<span className={tone}>{ev.status}</span>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="card py-3"><div className="label">Triggered value</div><div className="tabular-nums">{ev.triggeredValue}</div></div>
        <div className="card py-3"><div className="label">Baseline</div><div className="tabular-nums">{ev.baselineValue ?? "-"}</div></div>
        <div className="card py-3"><div className="label">Fired</div><div>{fmtTime(ev.createdAt)}</div></div>
        <div className="card py-3"><div className="label">Notification</div><div className="text-sm">{ev.notifiedAt ? `sent via ${rule.channel}` : ev.notifyError ? <span className="text-bad">failed</span> : "pending"}</div></div>
      </div>
      {ev.notifyError && <div className="card border-bad/30 bg-bad/5 text-sm text-bad">{ev.notifyError}</div>}
      <div className="card text-sm">
        <div className="card-title mb-2">Rule</div>
        <div className="text-muted">{rule.metric} · {rule.condition} {rule.threshold} · window {rule.windowMinutes}m · cooldown {rule.cooldownMinutes}m · channel {rule.channel}</div>
      </div>
      <div className="flex gap-2"><Link className="btn-ghost" href="/traces">Inspect traces</Link>{rule.promptTemplateId && <Link className="btn-ghost" href={`/prompts/${rule.promptTemplateId}`}>Open template</Link>}</div>
    </div>
  );
}
