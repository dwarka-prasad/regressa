import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { createDb } from "@regressa/db";
import { config } from "./config.js";
import { dbKeyLookup, makeApiKeyAuth, markKeyUsed } from "./auth/apiKey.js";
import { tracesRoutes } from "./routes/v1/traces.js";
import { otlpRoutes } from "./routes/v1/otlp.js";
import { redis, tracesQueue } from "./queue/index.js";

export async function buildServer() {
  const { db, close } = createDb(config.databaseUrl, 5);
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" }, bodyLimit: 5 * 1024 * 1024, trustProxy: true });

  await app.register(cors, { origin: true, allowedHeaders: ["Content-Type", "Authorization", "X-Regressa-Project-Key"] });
  await app.register(rateLimit, {
    global: false,
    redis,
    keyGenerator: (req) => req.keyContext?.apiKeyId ?? req.ip,
  });

  app.get("/health", async () => ({ ok: true, service: "regressa-ingest", ts: new Date().toISOString() }));
  app.get("/ready", async (_req, reply) => {
    try {
      await redis.ping();
      await db.execute("select 1" as never);
      return { ok: true };
    } catch (err) {
      return reply.code(503).send({ ok: false, error: String(err) });
    }
  });

  await app.register(async (v1) => {
    v1.addHook("preHandler", makeApiKeyAuth(dbKeyLookup(db), { onUsed: markKeyUsed(db) }));
    const deps = { enqueue: (job: Parameters<typeof tracesQueue.add>[1]) => tracesQueue.add("persist", job) };
    await v1.register(tracesRoutes, deps);
    await v1.register(otlpRoutes, deps);
  });

  app.addHook("onClose", async () => { await tracesQueue.close(); await redis.quit(); await close(); });
  return app;
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop()!);
if (isMain) {
  buildServer().then((app) => {
    app.listen({ port: config.port, host: config.host }).then(() => {
      app.log.info(`regressa ingest-api listening on :${config.port}`);
    });
    const stop = () => app.close().then(() => process.exit(0));
    process.on("SIGINT", stop); process.on("SIGTERM", stop);
  });
}
