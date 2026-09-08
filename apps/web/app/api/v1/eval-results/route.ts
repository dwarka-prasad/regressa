import { NextResponse, type NextRequest } from "next/server";
import { and, desc, eq, gte } from "drizzle-orm";
import { apiAuth, paging } from "@/lib/apiAuth";
import { db, schema } from "@/lib/db";

export const dynamic = "force-dynamic";

/** GET /api/v1/eval-results?eval_definition_id=&since=&limit=&offset= */
export async function GET(req: NextRequest) {
  const ctx = await apiAuth(req);
  if (ctx instanceof NextResponse) return ctx;
  const { limit, offset, since } = paging(req);
  const defId = req.nextUrl.searchParams.get("eval_definition_id");
  const rows = await db().select({
    id: schema.evalResults.id, trace_id: schema.evalResults.traceId, eval_definition_id: schema.evalResults.evalDefinitionId, eval_name: schema.evalDefinitions.name,
    score: schema.evalResults.score, passed: schema.evalResults.passed, reasoning: schema.evalResults.reasoning, created_at: schema.evalResults.createdAt,
  }).from(schema.evalResults).innerJoin(schema.evalDefinitions, eq(schema.evalDefinitions.id, schema.evalResults.evalDefinitionId))
    .where(and(eq(schema.evalResults.projectId, ctx.projectId), since ? gte(schema.evalResults.createdAt, since) : undefined, defId ? eq(schema.evalResults.evalDefinitionId, defId) : undefined))
    .orderBy(desc(schema.evalResults.createdAt)).limit(limit).offset(offset);
  return NextResponse.json({ data: rows, limit, offset });
}
