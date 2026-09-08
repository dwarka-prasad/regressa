import { NextResponse, type NextRequest } from "next/server";
import { and, desc, eq, gte } from "drizzle-orm";
import { apiAuth, paging } from "@/lib/apiAuth";
import { db, schema } from "@/lib/db";

export const dynamic = "force-dynamic";

/** GET /api/v1/alert-events?status=&since=&limit=&offset= */
export async function GET(req: NextRequest) {
  const ctx = await apiAuth(req);
  if (ctx instanceof NextResponse) return ctx;
  const { limit, offset, since } = paging(req);
  const status = req.nextUrl.searchParams.get("status");
  const rows = await db().select({
    id: schema.alertEvents.id, rule_id: schema.alertRules.id, rule_name: schema.alertRules.name, metric: schema.alertRules.metric,
    status: schema.alertEvents.status, triggered_value: schema.alertEvents.triggeredValue, baseline_value: schema.alertEvents.baselineValue,
    message: schema.alertEvents.message, notified_at: schema.alertEvents.notifiedAt, created_at: schema.alertEvents.createdAt,
  }).from(schema.alertEvents).innerJoin(schema.alertRules, eq(schema.alertRules.id, schema.alertEvents.alertRuleId))
    .where(and(eq(schema.alertEvents.projectId, ctx.projectId), since ? gte(schema.alertEvents.createdAt, since) : undefined, status ? eq(schema.alertEvents.status, status) : undefined))
    .orderBy(desc(schema.alertEvents.createdAt)).limit(limit).offset(offset);
  return NextResponse.json({ data: rows, limit, offset });
}
