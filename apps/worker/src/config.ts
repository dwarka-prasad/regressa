export const config = {
  databaseUrl: process.env.DATABASE_URL ?? "postgres://regressa:regressa@localhost:5433/regressa_dev",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6380",
  judgeModel: process.env.REGRESSA_JUDGE_MODEL ?? "claude-sonnet-5",
  embeddingModel: process.env.REGRESSA_EMBEDDING_MODEL ?? "text-embedding-3-small",
  openaiApiKey: process.env.OPENAI_API_KEY,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  concurrency: {
    traces: Number(process.env.WORKER_TRACES_CONCURRENCY ?? 8),
    evals: Number(process.env.WORKER_EVALS_CONCURRENCY ?? 4),
    alerts: 1,
    notify: 4,
  },
  alertEvalIntervalMs: Number(process.env.ALERT_EVAL_INTERVAL_MS ?? 60_000),
};
