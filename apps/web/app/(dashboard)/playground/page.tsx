import { and, eq } from "drizzle-orm";
import { getCtx } from "@/lib/current";
import { db, schema } from "@/lib/db";
import { PLAYGROUND_MODELS, providerConfigured, toPlainMessages } from "@/lib/llm";
import { PageHeader } from "@/components/PageHeader";
import { PlaygroundForm } from "./PlaygroundForm";

export default async function PlaygroundPage({ searchParams }: { searchParams: { trace?: string; at?: string } }) {
  const { project } = await getCtx();
  let original: { model: string; output: string | null; system: string; user: string; latencyMs: number | null; costUsd: string | null; templateName?: string | null } | null = null;
  if (searchParams.trace) {
    const [row] = await db().select({ t: schema.traces, templateName: schema.promptTemplates.name }).from(schema.traces)
      .leftJoin(schema.promptVersions, eq(schema.promptVersions.id, schema.traces.promptVersionId))
      .leftJoin(schema.promptTemplates, eq(schema.promptTemplates.id, schema.promptVersions.promptTemplateId))
      .where(and(eq(schema.traces.id, searchParams.trace), eq(schema.traces.projectId, project.id), searchParams.at ? eq(schema.traces.createdAt, new Date(searchParams.at)) : undefined)).limit(1);
    if (row) {
      const msgs = toPlainMessages(row.t.inputMessages);
      original = {
        model: row.t.model, output: row.t.outputText, latencyMs: row.t.latencyMs, costUsd: row.t.totalCostUsd, templateName: row.templateName,
        system: msgs.filter((m) => m.role === "system").map((m) => m.content).join("\n\n"),
        user: msgs.filter((m) => m.role !== "system").map((m) => (m.role === "user" ? m.content : `[${m.role}] ${m.content}`)).join("\n\n"),
      };
    }
  }
  const models = PLAYGROUND_MODELS.map((m) => ({ ...m, available: providerConfigured(m.provider) }));
  return (
    <div>
      <PageHeader title="Playground" description="Replay a trace with a different prompt or model and compare side by side. Runs use the dashboard's provider keys and are not recorded as traces." />
      <PlaygroundForm models={models} original={original} />
    </div>
  );
}
