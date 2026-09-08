/** Seed a demo org, user, project, API key, one eval definition and one alert rule. */
import { randomBytes, scryptSync } from "node:crypto";
import { createDb } from "./client.js";
import { generateApiKey } from "./keys.js";
import { eq } from "drizzle-orm";
import * as s from "./schema.js";

async function main() {
  const { db, close } = createDb();

  const [org] = await db.insert(s.orgs).values({ name: "Demo Org", slug: "demo", plan: "pro" })
    .onConflictDoUpdate({ target: s.orgs.slug, set: { name: "Demo Org" } }).returning();
  // Same scrypt format as apps/web/lib/auth.ts. Demo login: demo@regressa.dev / regressa-demo
  const salt = randomBytes(16).toString("hex");
  const passwordHash = `${salt}:${scryptSync("regressa-demo", salt, 64).toString("hex")}`;
  const [user] = await db.insert(s.users).values({ email: "demo@regressa.dev", name: "Demo User", passwordHash })
    .onConflictDoUpdate({ target: s.users.email, set: { name: "Demo User", passwordHash } }).returning();
  await db.insert(s.orgMembers).values({ orgId: org!.id, userId: user!.id, role: "owner" }).onConflictDoNothing();

  const [project] = await db.insert(s.projects).values({ orgId: org!.id, name: "Support Bot", slug: "support-bot" })
    .onConflictDoUpdate({ target: [s.projects.orgId, s.projects.slug], set: { name: "Support Bot" } }).returning();

  const key = generateApiKey("test");
  await db.insert(s.apiKeys).values({
    projectId: project!.id, keyHash: key.hash, keyPrefix: key.prefix, mode: key.mode, label: "seed",
  });

  const existingEvals = await db.select({ id: s.evalDefinitions.id }).from(s.evalDefinitions).where(eq(s.evalDefinitions.projectId, project!.id)).limit(1);
  if (!existingEvals[0]) await db.insert(s.evalDefinitions).values({
    projectId: project!.id,
    name: "Helpfulness (LLM judge)",
    type: "llm_judge",
    config: {
      rubric: "Rate how helpful, accurate and on-topic the assistant response is for the user's request.",
      pass_threshold: 0.7,
    },
    sampleRate: "0.25",
  });

  const existingRules = await db.select({ id: s.alertRules.id }).from(s.alertRules).where(eq(s.alertRules.projectId, project!.id)).limit(1);
  if (!existingRules[0]) await db.insert(s.alertRules).values({
    projectId: project!.id,
    name: "Error rate > 5% (1h)",
    metric: "error_rate",
    condition: "gt",
    threshold: "0.05",
    windowMinutes: 60,
    channel: "webhook",
    channelConfig: { url: "https://example.com/regressa-hook" },
  });

  console.log(`
Seeded Regressa demo data.
  org:      ${org!.slug}  (${org!.id})
  project:  ${project!.slug} (${project!.id})
  login:    demo@regressa.dev / regressa-demo
  API key:  ${key.plaintext}
Send traces with header:  X-Regressa-Project-Key: ${key.plaintext}
`);
  await close();
}

main().catch((e) => { console.error(e); process.exit(1); });
