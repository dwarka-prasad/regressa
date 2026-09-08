import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { hashApiKey, parseKeyMode } from "@regressa/db";
import { REGRESSA_KEY_HEADER } from "@regressa/shared-types";
import { db, schema } from "./db";

export interface ApiCtx { projectId: string; orgId: string; plan: string }

/** Public REST API auth: same rgsa_ project keys as ingestion. Returns a NextResponse on failure. */
export async function apiAuth(req: NextRequest): Promise<ApiCtx | NextResponse> {
  const raw = req.headers.get(REGRESSA_KEY_HEADER) ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!raw || !parseKeyMode(raw)) return NextResponse.json({ error: "missing_or_malformed_key" }, { status: 401 });
  const [row] = await db().select({ projectId: schema.projects.id, orgId: schema.orgs.id, plan: schema.orgs.plan, revokedAt: schema.apiKeys.revokedAt })
    .from(schema.apiKeys)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.apiKeys.projectId))
    .innerJoin(schema.orgs, eq(schema.orgs.id, schema.projects.orgId))
    .where(eq(schema.apiKeys.keyHash, hashApiKey(raw))).limit(1);
  if (!row || row.revokedAt) return NextResponse.json({ error: "invalid_or_revoked_key" }, { status: 401 });
  return { projectId: row.projectId, orgId: row.orgId, plan: row.plan };
}

export function paging(req: NextRequest) {
  const url = req.nextUrl;
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0));
  const since = url.searchParams.get("since");
  return { limit, offset, since: since ? new Date(since) : null };
}
