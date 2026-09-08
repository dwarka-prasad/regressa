import { NextResponse, type NextRequest } from "next/server";
import { and, desc, eq, gte } from "drizzle-orm";
import { apiAuth, paging } from "@/lib/apiAuth";
import { db, schema } from "@/lib/db";

export const dynamic = "force-dynamic";

/** GET /api/v1/traces?limit=&offset=&since=&status=&model= */
export async function GET(req: NextRequest) {
  const ctx = await apiAuth(req);
  if (ctx instanceof NextResponse) return ctx;
  const { limit, offset, since } = paging(req);
  const status = req.nextUrl.searchParams.get("status");
  const model = req.nextUrl.searchParams.get("model");
  const rows = await db().select({
    id: schema.traces.id, created_at: schema.traces.createdAt, model: schema.traces.model, provider: schema.traces.provider,
    status: schema.traces.status, latency_ms: schema.traces.latencyMs, prompt_tokens: schema.traces.promptTokens,
    completion_tokens: schema.traces.completionTokens, total_cost_usd: schema.traces.totalCostUsd,
    prompt_version_id: schema.traces.promptVersionId, template: schema.promptTemplates.name, version_number: schema.promptVersions.versionNumber,
    output_text: schema.traces.outputText, error_message: schema.traces.errorMessage, metadata: schema.traces.metadata, trace_group_id: schema.traces.traceGroupId,
  }).from(schema.traces)
    .leftJoin(schema.promptVersions, eq(schema.promptVersions.id, schema.traces.promptVersionId))
    .leftJoin(schema.promptTemplates, eq(schema.promptTemplates.id, schema.promptVersions.promptTemplateId))
    .where(and(eq(schema.traces.projectId, ctx.projectId),
      since ? gte(schema.traces.createdAt, since) : undefined,
      status ? eq(schema.traces.status, status) : undefined,
      model ? eq(schema.traces.model, model) : undefined))
    .orderBy(desc(schema.traces.createdAt)).limit(limit).offset(offset);
  return NextResponse.json({ data: rows, limit, offset });
}
