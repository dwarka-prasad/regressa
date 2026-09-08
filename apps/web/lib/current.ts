import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "./db";
import { currentUserId } from "./auth";

export const PROJECT_COOKIE = "regressa_project";

export interface Ctx {
  user: typeof schema.users.$inferSelect;
  org: typeof schema.orgs.$inferSelect;
  role: string;
  projects: (typeof schema.projects.$inferSelect)[];
  project: typeof schema.projects.$inferSelect;
}

/** Resolve the signed-in user, their org, and the active project. Redirects to /login when signed out. */
export const getCtx = cache(async (): Promise<Ctx> => {
  const uid = currentUserId();
  if (!uid) redirect("/login");
  const d = db();
  const [user] = await d.select().from(schema.users).where(eq(schema.users.id, uid)).limit(1);
  if (!user) redirect("/login");

  const memberships = await d.select({ org: schema.orgs, role: schema.orgMembers.role }).from(schema.orgMembers)
    .innerJoin(schema.orgs, eq(schema.orgs.id, schema.orgMembers.orgId)).where(eq(schema.orgMembers.userId, uid));
  const m = memberships[0];
  if (!m) redirect("/signup?step=org");

  const projects = await d.select().from(schema.projects).where(eq(schema.projects.orgId, m.org.id)).orderBy(schema.projects.createdAt);
  if (projects.length === 0) redirect("/settings?new=project");
  const wanted = cookies().get(PROJECT_COOKIE)?.value;
  const project = projects.find((p) => p.id === wanted) ?? projects[0]!;
  return { user, org: m.org, role: m.role, projects, project };
});

/** Assert a row belongs to the active project. */
export async function assertProjectOwns(table: "eval_definitions" | "alert_rules" | "api_keys" | "prompt_templates", id: string, projectId: string) {
  const d = db();
  const t = { eval_definitions: schema.evalDefinitions, alert_rules: schema.alertRules, api_keys: schema.apiKeys, prompt_templates: schema.promptTemplates }[table];
  const [row] = await d.select({ id: t.id }).from(t).where(and(eq(t.id, id), eq(t.projectId, projectId))).limit(1);
  if (!row) throw new Error("not found");
}
