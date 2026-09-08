# Architecture

```
SDK (@regressa/node, regressa-sdk)
   |  POST /v1/traces  (X-Regressa-Project-Key)
   v
ingest-api (Fastify)  -- validates (zod), authenticates key (sha256 lookup, 60s cache), enqueues
   |  BullMQ  regressa-traces
   v
worker/persist  -- resolves prompt template versions (sha256 of normalized template),
   |              inserts into Timescale hypertable, fans out eval jobs, fires version-change alerts
   |  BullMQ  regressa-evals
   v
worker/evals    -- semantic_similarity | llm_judge | custom_function  -> eval_results hypertable
   
worker/alerts   -- every 60s evaluates alert_rules over rolling windows -> alert_events
   |  BullMQ  regressa-notify
   v
worker/notify   -- slack | webhook (HMAC signed) | email

web (Next.js 14) -- dashboard (server components read Postgres directly) + public REST API + Stripe
```

Tenancy: `orgs -> projects -> api_keys -> traces`. Every query in the dashboard and the public API is scoped
by `project_id`, which is derived from the session (dashboard) or the API key (REST/ingest). Never from user input.

Storage: `traces` and `eval_results` are Timescale hypertables (1-day chunks, 90-day retention). `traces_hourly`
and `eval_scores_hourly` are continuous aggregates refreshed every 15 minutes for long-range charts.
