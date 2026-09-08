"use server";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getCtx } from "@/lib/current";
import { db, schema } from "@/lib/db";
import { audit } from "@/lib/audit";

export async function createEval(form: FormData) {
  const { project } = await getCtx();
  const type = String(form.get("type"));
  const name = String(form.get("name") ?? "").trim();
  const sampleRate = Math.min(1, Math.max(0, Number(form.get("sample_rate") ?? 1)));
  const promptTemplateId = String(form.get("prompt_template_id") ?? "") || null;
  const threshold = Number(form.get("pass_threshold") ?? 0.7);
  let config: Record<string, unknown>;
  if (type === "llm_judge") config = { rubric: String(form.get("rubric") ?? ""), pass_threshold: threshold, judge_model: String(form.get("judge_model") ?? "") || undefined };
  else if (type === "semantic_similarity") config = { pass_threshold: threshold, embedding_model: "text-embedding-3-small" };
  else config = { source: String(form.get("source") ?? ""), pass_threshold: threshold };
  if (!name) return;
  const [def] = await db().insert(schema.evalDefinitions).values({ projectId: project.id, name, type, config, sampleRate: sampleRate.toFixed(3), promptTemplateId }).returning();

  const golden = String(form.get("golden") ?? "").trim();
  if (type === "semantic_similarity" && golden) {
    const examples = golden.split(/^---$/m).map((s) => s.trim()).filter(Boolean);
    if (examples.length) await db().insert(schema.goldenExamples).values(examples.map((e) => ({ evalDefinitionId: def!.id, inputMessages: [], expectedOutput: e })));
  }
  await audit({ orgId: (await getCtx()).org.id, projectId: project.id, userId: (await getCtx()).user.id, email: (await getCtx()).user.email }, "eval.create", name, { type });
  revalidatePath("/evals");
}

export async function toggleEval(form: FormData) {
  const { project } = await getCtx();
  const id = String(form.get("id"));
  const active = form.get("active") === "true";
  await db().update(schema.evalDefinitions).set({ isActive: active }).where(and(eq(schema.evalDefinitions.id, id), eq(schema.evalDefinitions.projectId, project.id)));
  revalidatePath("/evals");
}

export async function deleteEval(form: FormData) {
  const { project, org, user } = await getCtx();
  await audit({ orgId: org.id, projectId: project.id, userId: user.id, email: user.email }, "eval.delete", String(form.get("id")));
  const id = String(form.get("id"));
  await db().delete(schema.evalDefinitions).where(and(eq(schema.evalDefinitions.id, id), eq(schema.evalDefinitions.projectId, project.id)));
  revalidatePath("/evals");
}
