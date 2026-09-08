import { cookies } from "next/headers";
import { desc, eq, sql } from "drizzle-orm";
import { planLimits, PLAN_LIMITS, REDACTION_PRESETS, type RedactionRule } from "@regressa/shared-types";
import { desc as descOrder } from "drizzle-orm";
import { AUDIT_LABELS } from "@/lib/audit";
import { ssoEnabled } from "@/lib/oidc";
import { getCtx } from "@/lib/current";
import { db, schema } from "@/lib/db";
import { orgUsageThisMonth } from "@/lib/queries";
import { createApiKey, createProject, inviteMember, removeMember, renameOrg, revokeApiKey, updateGovernance, updateSso } from "./actions";
import { ago, fmtInt, fmtTime } from "@/lib/format";
import { NewKeyBanner } from "@/components/NewKeyBanner";
import { PageHeader } from "@/components/PageHeader";
import { CopyButton } from "@/components/CopyButton";
import { KeyRound, Users } from "lucide-react";
import { Stagger, StaggerItem } from "@/components/motion";

export default async function SettingsPage({ searchParams }: { searchParams: { welcome?: string; billing?: string } }) {
  const ctx = await getCtx();
  const d = db();
  const [keys, members, usage, auditRows, monthSpend] = await Promise.all([
    d.select().from(schema.apiKeys).where(eq(schema.apiKeys.projectId, ctx.project.id)).orderBy(desc(schema.apiKeys.createdAt)),
    d.select({ user: schema.users, role: schema.orgMembers.role }).from(schema.orgMembers).innerJoin(schema.users, eq(schema.users.id, schema.orgMembers.userId)).where(eq(schema.orgMembers.orgId, ctx.org.id)),
    orgUsageThisMonth(ctx.org.id),
    d.select().from(schema.auditLog).where(eq(schema.auditLog.orgId, ctx.org.id)).orderBy(descOrder(schema.auditLog.createdAt)).limit(40),
    d.execute(sql`SELECT coalesce(sum(total_cost_usd),0)::float8 AS spend FROM regressa.traces WHERE project_id = ${ctx.project.id} AND created_at >= date_trunc('month', now())`).then((r) => Number((r as unknown as { spend: number }[])[0]?.spend ?? 0)),
  ]);
  const rules = (Array.isArray(ctx.project.redactionRules) ? ctx.project.redactionRules : []) as RedactionRule[];
  const presetNames = new Set(REDACTION_PRESETS.map((p) => p.name));
  const enabledPresets = rules.filter((r) => presetNames.has(r.name) && REDACTION_PRESETS.some((p) => p.name === r.name && p.pattern === r.pattern)).map((r) => r.name);
  const customRules = rules.filter((r) => !enabledPresets.includes(r.name));
  const budget = ctx.project.budgetMonthlyUsd == null ? null : Number(ctx.project.budgetMonthlyUsd);
  const newKey = cookies().get("regressa_new_key")?.value;
  const flash = cookies().get("regressa_flash")?.value;
  const ingestUrl = process.env.NEXT_PUBLIC_INGEST_URL ?? "http://localhost:4100";
  const limits = planLimits(ctx.org.plan);
  const usagePct = Number.isFinite(limits.tracesPerMonth) ? Math.min(100, (usage / limits.tracesPerMonth) * 100) : 0;
  const canAdmin = ["owner", "admin"].includes(ctx.role);

  return (
    <div className="space-y-5">
      <PageHeader title="Settings" description={`${ctx.org.name} · ${ctx.project.name}`} />
      {searchParams.welcome && <div className="card border-brand/30 bg-brand-soft/50 text-sm">Welcome to Regressa. Create an API key below, then wrap your LLM client with the SDK. The Overview page tracks your setup progress.</div>}
      {searchParams.billing === "success" && <div className="card border-ok/30 bg-ok/5 text-sm">Subscription active. Thanks for upgrading.</div>}
      {flash && /password/i.test(flash) && <div className="card border-warn/30 bg-warn/10 text-sm break-all">{flash}</div>}
      {newKey && <NewKeyBanner plaintext={newKey} ingestUrl={ingestUrl} />}

      <section className="card" id="keys">
        <div className="mb-3 flex items-center gap-2"><KeyRound size={16} className="text-muted" /><h2 className="card-title">API keys</h2><span className="text-xs text-muted">for {ctx.project.name}</span></div>
        <form action={createApiKey} className="mb-4 flex flex-wrap items-end gap-2">
          <div><label className="label">Label</label><input className="input w-48" name="label" placeholder="backend-prod" /></div>
          <div><label className="label">Mode</label><select className="input w-28" name="mode" defaultValue="live"><option value="live">live</option><option value="test">test</option></select></div>
          <button className="btn-primary" type="submit">Create key</button>
        </form>
        {keys.length === 0 ? <p className="text-sm text-muted">No keys yet.</p> : (
          <table className="data">
            <thead><tr><th>Key</th><th>Label</th><th>Mode</th><th>Last used</th><th>Created</th><th></th></tr></thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id} className={k.revokedAt ? "opacity-50" : ""}>
                  <td className="mono">{k.keyPrefix}</td><td>{k.label ?? "-"}</td><td><span className="badge-muted">{k.mode}</span></td>
                  <td className="text-muted">{k.lastUsedAt ? ago(k.lastUsedAt) : "never"}</td><td className="text-muted">{fmtTime(k.createdAt)}</td>
                  <td className="text-right">{k.revokedAt ? <span className="text-xs text-muted">revoked</span> : <form action={revokeApiKey}><input type="hidden" name="id" value={k.id} /><button className="btn-danger btn-sm">Revoke</button></form>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card" id="members">
          <div className="mb-3 flex items-center gap-2"><Users size={16} className="text-muted" /><h2 className="card-title">Members</h2><span className="text-xs text-muted">{members.length} / {Number.isFinite(limits.members) ? limits.members : "unlimited"}</span></div>
          <ul className="mb-4 divide-y divide-line/70 text-sm">
            {members.map(({ user, role }) => (
              <li key={user.id} className="flex items-center gap-3 py-2">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-soft text-xs font-semibold uppercase text-brand">{(user.name || user.email).slice(0, 1)}</span>
                <div className="min-w-0 flex-1"><div className="truncate font-medium">{user.name || user.email}</div>{user.name && <div className="truncate text-xs text-muted">{user.email}</div>}</div>
                <span className="badge-muted capitalize">{role}</span>
                {ctx.role === "owner" && user.id !== ctx.user.id && <form action={removeMember}><input type="hidden" name="user_id" value={user.id} /><button className="btn-danger btn-sm">Remove</button></form>}
              </li>
            ))}
          </ul>
          {canAdmin && (
            <form action={inviteMember} className="flex flex-wrap items-end gap-2">
              <div className="flex-1"><label className="label">Invite by email</label><input className="input" name="email" type="email" required placeholder="teammate@company.com" /></div>
              <div><label className="label">Role</label><select className="input w-28" name="role" defaultValue="member"><option value="member">member</option><option value="admin">admin</option></select></div>
              <button className="btn-primary" type="submit">Invite</button>
            </form>
          )}
        </section>

        <section className="card" id="billing">
          <h2 className="card-title">Plan and usage</h2>
          <div className="mt-3 flex items-baseline justify-between text-sm"><span>{limits.label} plan</span><span className="tabular-nums text-muted">{fmtInt(usage)} / {Number.isFinite(limits.tracesPerMonth) ? fmtInt(limits.tracesPerMonth) : "unlimited"} traces this month</span></div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-line"><div className={`h-full ${usagePct > 90 ? "bg-bad" : "bg-brand"}`} style={{ width: `${usagePct}%` }} /></div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
            {Object.entries(PLAN_LIMITS).filter(([k]) => k !== "enterprise").map(([k, v]) => (
              <div key={k} className={`rounded-xl border p-3 ${k === ctx.org.plan ? "border-brand bg-brand-soft/40" : "border-line"}`}>
                <div className="font-semibold">{v.label}</div>
                <div className="mt-1 text-muted">{fmtInt(v.tracesPerMonth)} traces</div>
                <div className="text-muted">{v.retentionDays}d retention · {v.members} seats</div>
                {k !== ctx.org.plan && k !== "free" && ctx.role === "owner" && <a className="link mt-2 inline-block" href={`/api/stripe/checkout?plan=${k}`}>Upgrade</a>}
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="card" id="governance">
        <h2 className="card-title">Governance for {ctx.project.name}</h2>
        <p className="mt-1 text-xs text-muted">Budget caps, PII redaction at ingest, and retention. Applied by the ingest API and worker within a minute.</p>
        <form action={updateGovernance} className="mt-4 grid gap-4 lg:grid-cols-3">
          <div className="space-y-3">
            <div><label className="label">Monthly budget (USD)</label><input className="input" name="budget_monthly_usd" type="number" step="0.01" min="0" defaultValue={budget ?? ""} placeholder="no cap" />
              <div className="mt-1 text-xs text-muted">Spent this month: ${monthSpend.toFixed(2)}{budget != null && <> of ${budget.toFixed(2)}</>}{ctx.project.budgetExceededAt && <span className="ml-1 badge-bad">exceeded</span>}</div>
              {budget != null && <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line"><div className={`h-full ${monthSpend >= budget ? "bg-bad" : "bg-brand"}`} style={{ width: `${Math.min(100, (monthSpend / Math.max(budget, 0.01)) * 100)}%` }} /></div>}</div>
            <div><label className="label">When exceeded</label>
              <select className="input" name="budget_action" defaultValue={ctx.project.budgetAction}><option value="alert">Alert only (needs a budget alert rule)</option><option value="sample_10">Alert and sample 10% of traces</option></select></div>
            <div><label className="label">Retention override (days)</label><input className="input" name="retention_days" type="number" min="1" max="365" defaultValue={ctx.project.retentionDays ?? ""} placeholder={`plan default ${limits.retentionDays}`} />
              <div className="mt-1 text-xs text-muted">Capped at {limits.retentionDays} days on the {limits.label} plan.</div></div>
          </div>
          <div>
            <label className="label">Redaction presets</label>
            <div className="grid gap-1.5">
              {REDACTION_PRESETS.map((p) => (
                <label key={p.name} className="flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-sm"><input type="checkbox" name="preset" value={p.name} defaultChecked={enabledPresets.includes(p.name)} /><span className="flex-1 capitalize">{p.name.replace("_", " ")}</span><code className="mono text-muted">{p.replacement}</code></label>
              ))}
            </div>
          </div>
          <div className="flex flex-col">
            <label className="label">Custom rules (one per line: name ||| regex ||| replacement)</label>
            <textarea className="input flex-1 font-mono text-xs" name="custom_rules" rows={8} defaultValue={customRules.map((r) => `${r.name} ||| ${r.pattern} ||| ${r.replacement}`).join(String.fromCharCode(10))} placeholder={"order_id ||| ORD-[0-9]{8} ||| [ORDER]"} />
            <button className="btn-primary mt-3 self-end" type="submit" disabled={!canAdmin}>Save governance</button>
          </div>
        </form>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <form action={updateSso} className="card space-y-3">
          <h2 className="card-title">Single sign-on and digests</h2>
          <div className="text-xs text-muted">{ssoEnabled() ? "OIDC is configured on this server. Users whose email matches the domain below join this org automatically." : "OIDC is not configured on this server. Set OIDC_ISSUER, OIDC_CLIENT_ID and OIDC_CLIENT_SECRET to enable the SSO button on the login page."}</div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="label">SSO email domain</label><input className="input" name="sso_domain" defaultValue={ctx.org.ssoDomain ?? ""} placeholder="company.com" /></div>
            <div><label className="label">Default role</label><select className="input" name="sso_default_role" defaultValue={ctx.org.ssoDefaultRole}><option value="member">member</option><option value="admin">admin</option></select></div>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="weekly_digest" defaultChecked={ctx.org.weeklyDigest} />Send owners and admins a weekly email digest{!process.env.SMTP_URL && <span className="text-xs text-muted">(needs SMTP_URL)</span>}</label>
          <button className="btn-ghost" type="submit" disabled={ctx.role !== "owner"}>Save</button>
        </form>
        <section className="card" id="audit">
          <h2 className="card-title">Audit log</h2>
          {auditRows.length === 0 ? <p className="mt-2 text-sm text-muted">No events yet.</p> : (
            <ul className="mt-2 max-h-80 divide-y divide-line/70 overflow-y-auto text-sm">
              {auditRows.map((a) => (
                <li key={a.id} className="flex items-start gap-3 py-2">
                  <div className="min-w-0 flex-1"><span className="font-medium">{a.actorEmail ?? "system"}</span> <span className="text-muted">{AUDIT_LABELS[a.action] ?? a.action}</span>{a.target && <span className="ml-1 mono text-muted">{a.target}</span>}</div>
                  <span className="shrink-0 text-xs text-muted" title={fmtTime(a.createdAt)}>{ago(a.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <form action={createProject} className="card space-y-3">
          <h2 className="card-title">New project</h2>
          <div><label className="label">Name</label><input className="input" name="name" required placeholder="Support Bot" /></div>
          <div><label className="label">Environment</label><select className="input" name="environment" defaultValue="production"><option>production</option><option>staging</option><option>development</option></select></div>
          <button className="btn-primary" type="submit" disabled={!canAdmin}>Create project</button>
        </form>
        <form action={renameOrg} className="card space-y-3">
          <h2 className="card-title">Organization</h2>
          <div><label className="label">Name</label><input className="input" name="name" defaultValue={ctx.org.name} /></div>
          <div className="grid gap-1 text-xs text-muted">
            <div className="flex items-center gap-2"><span>org</span><code className="mono">{ctx.org.id}</code><CopyButton text={ctx.org.id} label="" /></div>
            <div className="flex items-center gap-2"><span>project</span><code className="mono">{ctx.project.id}</code><CopyButton text={ctx.project.id} label="" /></div>
            <div className="flex items-center gap-2"><span>ingest</span><code className="mono">{ingestUrl}/v1/traces</code></div>
          </div>
          <button className="btn-ghost" type="submit" disabled={ctx.role !== "owner"}>Save</button>
        </form>
      </div>
    </div>
  );
}
