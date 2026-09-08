export const config = {
  port: Number(process.env.INGEST_PORT ?? 4100),
  host: process.env.INGEST_HOST ?? "0.0.0.0",
  databaseUrl: process.env.DATABASE_URL ?? "postgres://regressa:regressa@localhost:5433/regressa_dev",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6380",
  maxBatch: Number(process.env.INGEST_MAX_BATCH ?? 500),
  /** Per-key requests per minute. */
  rateLimitPerMinute: Number(process.env.INGEST_RATE_LIMIT ?? 600),
  keyCacheTtlMs: 60_000,
};
