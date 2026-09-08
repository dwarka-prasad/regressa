import { db, schema } from "./db";

export interface AuditActor { orgId: string; projectId?: string | null; userId?: string | null; email?: string | null }

/** Append-only audit trail for security-relevant actions. Never throws: auditing must not break the action. */
export async function audit(actor: AuditActor, action: string, target?: string | null, meta: Record<string, unknown> = {}) {
  try {
    await db().insert(schema.auditLog).values({ orgId: actor.orgId, projectId: actor.projectId ?? null, actorUserId: actor.userId ?? null, actorEmail: actor.email ?? null, action, target: target ?? null, meta });
  } catch (err) {
    console.error("[audit] failed:", err);
  }
}

export const AUDIT_LABELS: Record<string, string> = {
  "api_key.create": "created an API key", "api_key.revoke": "revoked an API key",
  "member.invite": "invited a member", "member.remove": "removed a member",
  "alert_rule.create": "created an alert rule", "alert_rule.delete": "deleted an alert rule", "alert_rule.test": "sent a test notification",
  "eval.create": "created an eval", "eval.delete": "deleted an eval",
  "project.create": "created a project", "project.governance": "changed project governance", "org.rename": "renamed the organization", "org.sso": "changed SSO settings",
  "auth.login": "signed in", "auth.sso_login": "signed in via SSO", "auth.signup": "created the account", "playground.run": "ran the playground",
};
