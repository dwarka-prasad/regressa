# Deployment

## Topology

Three deployables plus two managed services:

| Service | Image / runtime | Scaling | Needs |
|---|---|---|---|
| `web` | `apps/web/Dockerfile` (Next.js, port 3100) | horizontal | `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_INGEST_URL` |
| `ingest-api` | `apps/ingest-api/Dockerfile` (port 4100) | horizontal | `DATABASE_URL`, `REDIS_URL` |
| `worker` | `apps/worker/Dockerfile` | horizontal (job schedulers dedupe) | `DATABASE_URL`, `REDIS_URL`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `SMTP_URL` |
| PostgreSQL 16 + TimescaleDB 2.x | Timescale Cloud, or `timescale/timescaledb-ha` | vertical | database `regressa_production` |
| Redis 7 | Managed Redis with AOF persistence | vertical | |

## Steps

1. Create the database and run migrations once: `DATABASE_URL=... pnpm db:migrate` (forward-only, idempotent).
2. Deploy `ingest-api` behind a load balancer on the ingest hostname (e.g. `ingest.regressa.dev`). Allow
   `POST` bodies up to 5 MB. Rate limiting is per key via Redis.
3. Deploy `worker` with at least one replica. Set provider keys for evals and `SMTP_URL` for email.
4. Deploy `web` on the app hostname. Set `NEXTAUTH_SECRET` to a long random value. Configure Stripe
   (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_TEAM`) and point the Stripe
   webhook at `/api/stripe/webhook`. Configure OIDC (`OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`) for SSO.
5. Point DNS: `app.` to web, `ingest.` to ingest-api, `docs.` to the Pages site.

## Environment reference

See `.env.example` at the repo root for every variable with a comment. Never set `NODE_ENV` in `.env`.

## Local

```bash
pnpm infra:up && pnpm db:migrate && pnpm db:seed && pnpm dev
```

## Backups and retention

Back up Postgres daily. Traces are retained per plan (7/30/90/365 days) by the maintenance worker and a 90-day
table policy; adjust `add_retention_policy` in the migration for longer enterprise retention.

## Observability of Regressa itself

- `GET /health` and `GET /ready` on ingest-api; `GET /api/health` on web.
- BullMQ queue depth in Redis (`bull:regressa-*`). Alert if `regressa-traces` waiting count grows for >5 minutes.
- Worker logs `[worker:<queue>] job ... failed` on every failure with the reason.
