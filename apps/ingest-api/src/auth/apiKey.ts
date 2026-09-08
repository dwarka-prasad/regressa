import type { FastifyRequest, FastifyReply } from "fastify";
import { eq, sql as dsql } from "drizzle-orm";
import { hashApiKey, parseKeyMode, schema, type RegressaDb } from "@regressa/db";
import { REGRESSA_KEY_HEADER } from "@regressa/shared-types";
import { config } from "../config.js";

export interface KeyContext { apiKeyId: string; projectId: string; orgId: string; plan: string; mode: "live" | "test"; budgetExceeded?: boolean; budgetAction?: string }
export type KeyLookup = (hash: string) => Promise<KeyContext | null>;

/**
 * Fastify preHandler: resolves the rgsa_ key from X-Regressa-Project-Key (or Bearer), caches lookups for `ttlMs`.
 * `lookup` is injectable so the route layer can be tested without Postgres.
 */
export function makeApiKeyAuth(lookup: KeyLookup, opts: { ttlMs?: number; onUsed?: (ctx: KeyContext) => void; now?: () => number } = {}) {
  const ttl = opts.ttlMs ?? config.keyCacheTtlMs;
  const now = opts.now ?? Date.now;
  const cache = new Map<string, { ctx: KeyContext | null; expires: number }>();

  return async function apiKeyAuth(req: FastifyRequest, reply: FastifyReply) {
    const raw = headerValue(req.headers[REGRESSA_KEY_HEADER]) ?? bearer(headerValue(req.headers.authorization));
    if (!raw || !parseKeyMode(raw)) {
      return reply.code(401).send({ error: "missing_or_malformed_key", hint: `Send your rgsa_ key in ${REGRESSA_KEY_HEADER}` });
    }
    const hash = hashApiKey(raw);
    const cached = cache.get(hash);
    let ctx: KeyContext | null;
    if (cached && cached.expires > now()) {
      ctx = cached.ctx;
    } else {
      ctx = await lookup(hash);
      cache.set(hash, { ctx, expires: now() + ttl });
      if (ctx) opts.onUsed?.(ctx);
    }
    if (!ctx) return reply.code(401).send({ error: "invalid_or_revoked_key" });
    req.keyContext = ctx;
  };
}

/** Production lookup backed by Postgres. */
export function dbKeyLookup(db: RegressaDb): KeyLookup {
  return async (hash) => {
    const rows = await db
      .select({
        apiKeyId: schema.apiKeys.id, projectId: schema.projects.id, orgId: schema.orgs.id, plan: schema.orgs.plan,
        mode: schema.apiKeys.mode, revokedAt: schema.apiKeys.revokedAt,
        budgetExceededAt: schema.projects.budgetExceededAt, budgetAction: schema.projects.budgetAction,
      })
      .from(schema.apiKeys)
      .innerJoin(schema.projects, eq(schema.projects.id, schema.apiKeys.projectId))
      .innerJoin(schema.orgs, eq(schema.orgs.id, schema.projects.orgId))
      .where(eq(schema.apiKeys.keyHash, hash))
      .limit(1);
    const r = rows[0];
    if (!r || r.revokedAt) return null;
    return { apiKeyId: r.apiKeyId, projectId: r.projectId, orgId: r.orgId, plan: r.plan, mode: r.mode as "live" | "test", budgetExceeded: !!r.budgetExceededAt, budgetAction: r.budgetAction };
  };
}

export function markKeyUsed(db: RegressaDb) {
  return (ctx: KeyContext) => { void db.update(schema.apiKeys).set({ lastUsedAt: dsql`now()` }).where(eq(schema.apiKeys.id, ctx.apiKeyId)); };
}

function headerValue(v: string | string[] | undefined) { return Array.isArray(v) ? v[0] : v; }
function bearer(v: string | undefined) { return v?.startsWith("Bearer ") ? v.slice(7) : undefined; }

declare module "fastify" {
  interface FastifyRequest { keyContext?: KeyContext }
}
