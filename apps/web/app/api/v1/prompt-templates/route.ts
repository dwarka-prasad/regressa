import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { apiAuth } from "@/lib/apiAuth";
import { db, schema } from "@/lib/db";
import { versionStats } from "@/lib/queries";

export const dynamic = "force-dynamic";

/** GET /api/v1/prompt-templates  -> templates with per-version stats (30d). */
export async function GET(req: NextRequest) {
  const ctx = await apiAuth(req);
  if (ctx instanceof NextResponse) return ctx;
  const templates = await db().select().from(schema.promptTemplates).where(eq(schema.promptTemplates.projectId, ctx.projectId));
  const data = await Promise.all(templates.map(async (t) => ({ id: t.id, name: t.name, created_at: t.createdAt, versions: await versionStats(t.id) })));
  return NextResponse.json({ data });
}
