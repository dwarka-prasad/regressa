import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { schema, type RegressaDb } from "@regressa/db";
import { normalizeTemplate } from "@regressa/shared-types";

export interface ResolvedVersion { promptVersionId: string; promptTemplateId: string; isNew: boolean; versionNumber: number }

/**
 * Regression-detection core: map (project, template name, raw template) -> prompt_version row,
 * creating a new version when the normalized content hash hasn't been seen before.
 */
export async function resolvePromptVersion(db: RegressaDb, projectId: string, name: string, raw: string): Promise<ResolvedVersion> {
  const hash = createHash("sha256").update(normalizeTemplate(raw)).digest("hex");

  const [tpl] = await db.insert(schema.promptTemplates).values({ projectId, name })
    .onConflictDoUpdate({ target: [schema.promptTemplates.projectId, schema.promptTemplates.name], set: { name } })
    .returning({ id: schema.promptTemplates.id });
  const templateId = tpl!.id;

  const found = async () => {
    const rows = await db.select({ id: schema.promptVersions.id, versionNumber: schema.promptVersions.versionNumber })
      .from(schema.promptVersions)
      .where(and(eq(schema.promptVersions.promptTemplateId, templateId), eq(schema.promptVersions.contentHash, hash))).limit(1);
    return rows[0];
  };

  const existing = await found();
  if (existing) return { promptVersionId: existing.id, promptTemplateId: templateId, isNew: false, versionNumber: existing.versionNumber };

  // Allocate the next version number; retry once if a concurrent worker took the same number.
  for (let attempt = 0; attempt < 2; attempt++) {
    const [nextRow] = await db.select({ next: sql<number>`coalesce(max(${schema.promptVersions.versionNumber}), 0) + 1` })
      .from(schema.promptVersions).where(eq(schema.promptVersions.promptTemplateId, templateId));
    const next = nextRow?.next ?? 1;
    try {
      const [v] = await db.insert(schema.promptVersions)
        .values({ promptTemplateId: templateId, versionNumber: Number(next), contentHash: hash, rawTemplate: raw })
        .onConflictDoNothing({ target: [schema.promptVersions.promptTemplateId, schema.promptVersions.contentHash] })
        .returning({ id: schema.promptVersions.id, versionNumber: schema.promptVersions.versionNumber });
      if (v) return { promptVersionId: v.id, promptTemplateId: templateId, isNew: true, versionNumber: v.versionNumber };
      const again = await found(); // same hash inserted concurrently
      if (again) return { promptVersionId: again.id, promptTemplateId: templateId, isNew: false, versionNumber: again.versionNumber };
    } catch (err) {
      if (attempt === 1) throw err;
    }
  }
  throw new Error("failed to resolve prompt version");
}
