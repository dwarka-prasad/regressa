"use server";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getCtx } from "@/lib/current";
import { db, schema } from "@/lib/db";
import { sendTestNotification } from "@/lib/notify";
import { audit } from "@/lib/audit";

export async function createRule(form: FormData) {
  const { project } = await getCtx();
  const channel = String(form.get("channel"));
  const channelConfig = channel === "slack" ? { webhook_url: String(form.get("target")) }
    : channel === "email" ? { to: String(form.get("target")) }
    : { url: String(form.get("target")), secret: String(form.get("secret") ?? "") || undefined };
  const metric = String(form.get("metric"));
  await db().insert(schema.alertRules).values({
    projectId: project.id,
    name: String(form.get("name") ?? "").trim() || `${metric} alert`,
    metric,
    condition: metric === "prompt_version_change" || metric === "budget" ? "any" : String(form.get("condition")),
    threshold: String(Number(form.get("threshold") ?? 0)),
    windowMinutes: Number(form.get("window_minutes") ?? 60),
    cooldownMinutes: Number(form.get("cooldown_minutes") ?? 60),
    promptTemplateId: String(form.get("prompt_template_id") ?? "") || null,
    evalDefinitionId: String(form.get("eval_definition_id") ?? "") || null,
    channel, channelConfig,
  });
  await audit({ orgId: (await getCtx()).org.id, projectId: project.id, userId: (await getCtx()).user.id, email: (await getCtx()).user.email }, "alert_rule.create", String(form.get("name") ?? metric), { metric, channel });
  revalidatePath("/alerts");
}

export async function toggleRule(form: FormData) {
  const { project } = await getCtx();
  await db().update(schema.alertRules).set({ isActive: form.get("active") === "true" })
    .where(and(eq(schema.alertRules.id, String(form.get("id"))), eq(schema.alertRules.projectId, project.id)));
  revalidatePath("/alerts");
}

export async function deleteRule(form: FormData) {
  const { project, org, user } = await getCtx();
  await audit({ orgId: org.id, projectId: project.id, userId: user.id, email: user.email }, "alert_rule.delete", String(form.get("id")));
  await db().delete(schema.alertRules).where(and(eq(schema.alertRules.id, String(form.get("id"))), eq(schema.alertRules.projectId, project.id)));
  revalidatePath("/alerts");
}

export async function setEventStatus(form: FormData) {
  const { project } = await getCtx();
  const status = String(form.get("status"));
  if (!["open", "acknowledged", "resolved"].includes(status)) return;
  await db().update(schema.alertEvents).set({ status }).where(and(eq(schema.alertEvents.id, String(form.get("id"))), eq(schema.alertEvents.projectId, project.id)));
  revalidatePath("/alerts");
}

/** Send a test notification through a rule's channel so users can verify wiring without waiting for a regression. */
export async function testRule(form: FormData) {
  const { project } = await getCtx();
  const [rule] = await db().select().from(schema.alertRules).where(and(eq(schema.alertRules.id, String(form.get("id"))), eq(schema.alertRules.projectId, project.id))).limit(1);
  if (!rule) return;
  const result = await sendTestNotification(rule.channel, rule.channelConfig as Record<string, string>, { ruleName: rule.name, projectName: project.name });
  await db().insert(schema.alertEvents).values({
    alertRuleId: rule.id, projectId: project.id, triggeredValue: "0", status: "resolved",
    message: `Test notification for "${rule.name}" ${result.ok ? "delivered" : "failed"}${result.error ? `: ${result.error}` : ""}.`,
    notifiedAt: result.ok ? new Date() : null, notifyError: result.ok ? null : result.error ?? "unknown",
  });
  revalidatePath("/alerts");
}
