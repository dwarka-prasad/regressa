"use server";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { and, eq, sql } from "drizzle-orm";
import { generateApiKey } from "@regressa/db";
import { REDACTION_PRESETS, RedactionRulesSchema, planLimits } from "@regressa/shared-types";
import { audit } from "@/lib/audit";
import { getCtx, PROJECT_COOKIE } from "@/lib/current";
import { db, schema } from "@/lib/db";
import { hashPassword } from "@/lib/auth";

const flash = (name: string, value: string) => cookies().set(name, value, { httpOnly: true, sameSite: "lax", path: name === "regressa_new_key" ? "/settings" : "/", maxAge: 60 });

export async function createApiKey(form: FormData): Promise<void> {
  const { project } = await getCtx();
  const mode = form.get("mode") === "test" ? "test" : "live";
  const key = generateApiKey(mode);
  await db().insert(schema.apiKeys).values({ projectId: project.id, keyHash: key.hash, keyPrefix: key.prefix, mode, label: String(form.get("label") ?? "").trim() || null });
  flash("regressa_new_key", key.plaintext); // shown exactly once
  const ctx = await getCtx();
  await audit({ orgId: ctx.org.id, projectId: project.id, userId: ctx.user.id, email: ctx.user.email }, "api_key.create", key.prefix, { mode, label: form.get("label") });
  revalidatePath("/settings");
}

export async function revokeApiKey(form: FormData) {
  const { project, org, user } = await getCtx();
  const [k] = await db().update(schema.apiKeys).set({ revokedAt: sql`now()` })
    .where(and(eq(schema.apiKeys.id, String(form.get("id"))), eq(schema.apiKeys.projectId, project.id))).returning({ prefix: schema.apiKeys.keyPrefix });
  await audit({ orgId: org.id, projectId: project.id, userId: user.id, email: user.email }, "api_key.revoke", k?.prefix);
  revalidatePath("/settings");
}

export async function createProject(form: FormData) {
  const { org, role } = await getCtx();
  if (!["owner", "admin"].includes(role)) return;
  const name = String(form.get("name") ?? "").trim();
  if (!name) return;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `project-${Date.now()}`;
  const [p] = await db().insert(schema.projects).values({ orgId: org.id, name, slug, environment: String(form.get("environment") ?? "production") }).onConflictDoNothing().returning();
  if (p) cookies().set(PROJECT_COOKIE, p.id, { path: "/", maxAge: 31536000, sameSite: "lax" });
  const ctx = await getCtx();
  await audit({ orgId: org.id, projectId: p?.id, userId: ctx.user.id, email: ctx.user.email }, "project.create", name);
  revalidatePath("/", "layout");
}

export async function renameOrg(form: FormData) {
  const { org, role } = await getCtx();
  if (role !== "owner") return;
  const name = String(form.get("name") ?? "").trim();
  if (name) await db().update(schema.orgs).set({ name }).where(eq(schema.orgs.id, org.id));
  const ctx = await getCtx();
  await audit({ orgId: org.id, userId: ctx.user.id, email: ctx.user.email }, "org.rename", name, { from: org.name });
  revalidatePath("/", "layout");
}

/** Invite a teammate: creates the user if needed with a one-time password, adds them to the org. */
export async function inviteMember(form: FormData) {
  const { org, role } = await getCtx();
  if (!["owner", "admin"].includes(role)) return;
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const memberRole = ["admin", "member"].includes(String(form.get("role"))) ? String(form.get("role")) : "member";
  if (!email.includes("@")) return;
  const d = db();
  const [countRow] = await d.select({ n: sql<number>`count(*)::int` }).from(schema.orgMembers).where(eq(schema.orgMembers.orgId, org.id));
  const n = countRow?.n ?? 0;
  if (Number(n) >= planLimits(org.plan).members) { flash("regressa_flash", `Member limit reached for the ${org.plan} plan. Upgrade to add more seats.`); revalidatePath("/settings"); return; }
  let [user] = await d.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  let tempPassword: string | null = null;
  if (!user) {
    tempPassword = randomBytes(9).toString("base64url");
    [user] = await d.insert(schema.users).values({ email, passwordHash: hashPassword(tempPassword) }).returning();
  }
  await d.insert(schema.orgMembers).values({ orgId: org.id, userId: user!.id, role: memberRole }).onConflictDoNothing();
  const actor = await getCtx();
  await audit({ orgId: org.id, userId: actor.user.id, email: actor.user.email }, "member.invite", email, { role: memberRole });
  flash("regressa_flash", tempPassword ? `Invited ${email}. One-time password (share securely, shown once): ${tempPassword}` : `Added existing user ${email} to ${org.name}.`);
  revalidatePath("/settings");
}

export async function removeMember(form: FormData) {
  const { org, role, user } = await getCtx();
  const userId = String(form.get("user_id"));
  if (role !== "owner" || userId === user.id) return;
  await db().delete(schema.orgMembers).where(and(eq(schema.orgMembers.orgId, org.id), eq(schema.orgMembers.userId, userId)));
  await audit({ orgId: org.id, userId: user.id, email: user.email }, "member.remove", userId);
  revalidatePath("/settings");
}

/** Budget cap, over-budget action, redaction rules, retention override. */
export async function updateGovernance(form: FormData) {
  const { project, org, user, role } = await getCtx();
  if (!["owner", "admin"].includes(role)) return;
  const budgetRaw = String(form.get("budget_monthly_usd") ?? "").trim();
  const budget = budgetRaw === "" ? null : Math.max(0, Number(budgetRaw));
  const budgetAction = form.get("budget_action") === "sample_10" ? "sample_10" : "alert";
  const retentionRaw = String(form.get("retention_days") ?? "").trim();
  const retention = retentionRaw === "" ? null : Math.max(1, Math.min(365, Math.round(Number(retentionRaw))));
  const presets = form.getAll("preset").map(String);
  const custom = String(form.get("custom_rules") ?? "").trim();
  const rules = [
    ...REDACTION_PRESETS.filter((r) => presets.includes(r.name)),
    ...custom.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
      const [name, pattern, replacement] = l.split("|||").map((x) => x.trim());
      return { name: name || "custom", pattern: pattern || "", replacement: replacement || "[REDACTED]" };
    }).filter((r) => r.pattern),
  ];
  const parsed = RedactionRulesSchema.safeParse(rules);
  if (!parsed.success) { flash("regressa_flash", "Invalid redaction rule: " + parsed.error.issues[0]?.message); revalidatePath("/settings"); return; }
  for (const r of parsed.data) { try { new RegExp(r.pattern, "giu"); } catch { flash("regressa_flash", `Invalid regex in rule "${r.name}"`); revalidatePath("/settings"); return; } }
  await db().update(schema.projects).set({
    budgetMonthlyUsd: budget == null ? null : budget.toFixed(2), budgetAction, retentionDays: retention, redactionRules: parsed.data,
    // Raising or clearing the budget lifts sampling immediately; the worker re-flags if still over.
    budgetExceededAt: budget == null ? null : project.budgetExceededAt,
  }).where(eq(schema.projects.id, project.id));
  await audit({ orgId: org.id, projectId: project.id, userId: user.id, email: user.email }, "project.governance", project.name, { budget, budgetAction, retention, rules: parsed.data.map((r) => r.name) });
  flash("regressa_flash", "Governance settings saved.");
  revalidatePath("/settings");
}

export async function updateSso(form: FormData) {
  const { org, user, role } = await getCtx();
  if (role !== "owner") return;
  const domain = String(form.get("sso_domain") ?? "").trim().toLowerCase() || null;
  const defaultRole = form.get("sso_default_role") === "admin" ? "admin" : "member";
  const digest = form.get("weekly_digest") === "on";
  await db().update(schema.orgs).set({ ssoDomain: domain, ssoDefaultRole: defaultRole, weeklyDigest: digest }).where(eq(schema.orgs.id, org.id));
  await audit({ orgId: org.id, userId: user.id, email: user.email }, "org.sso", domain, { defaultRole, digest });
  flash("regressa_flash", "Organization settings saved.");
  revalidatePath("/settings");
}
