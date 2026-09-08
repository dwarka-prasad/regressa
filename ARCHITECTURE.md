# Regressa architecture

Regressa is a multi-tenant LLM observability and prompt-regression platform. This document describes the
system as built in this repository: components, data flow, storage, tenancy, and the trade-offs behind them.

## System overview

```mermaid
flowchart LR
  subgraph Apps["Customer application"]
    SDK["SDK<br/>@regressa/node · regressa-sdk · Go · Java"]
    OTEL["OpenTelemetry exporter"]
  end
  SDK -- "POST /v1/traces" --> ING
  OTEL -- "POST /v1/otlp/traces" --> ING
  subgraph Regressa
    ING["ingest-api<br/>Fastify"]
    Q1[("Redis · BullMQ<br/>regressa-traces")]
    W1["worker · persist<br/>version detection · redaction"]
    Q2[("regressa-evals")]
    W2["worker · evals<br/>LLM judge · golden set · custom JS"]
    W3["worker · alerts<br/>rules engine every 60s"]
    Q3[("regressa-notify")]
    W4["worker · notify<br/>Slack · webhook · email"]
    W5["worker · maintenance<br/>retention · weekly digest"]
    DB[("PostgreSQL + TimescaleDB<br/>schema regressa")]
    WEB["web · Next.js 14<br/>dashboard · public REST API · gate"]
  end
  ING --> Q1 --> W1 --> DB
  W1 --> Q2 --> W2 --> DB
  W3 --> DB
  W3 --> Q3 --> W4
  W5 --> DB
  WEB --> DB
  W4 --> Slack["Slack / webhooks / SMTP"]
  CI["CI job<br/>npx @regressa/node gate"] -- "GET /api/v1/gate" --> WEB
  User["Team"] --> WEB
```

## Components

| Component | Path | Role |
|---|---|---|
| Ingest API | `apps/ingest-api` | Authenticates project keys, validates payloads item by item, assigns ids, applies budget sampling, enqueues. Stateless; scale horizontally. |
| Worker | `apps/worker` | Five BullMQ consumers in one process (persist, evals, alerts, notify, maintenance). Scale by running more replicas; job schedulers are deduplicated by id. |
| Web | `apps/web` | Dashboard (server components read Postgres directly), public REST API, CI gate endpoint, OIDC SSO, Stripe. |
| DB package | `packages/db` | SQL migrations (source of truth), Drizzle models, key hashing, seed. |
| Shared types | `packages/shared-types` | Zod schemas for the wire format, model pricing, redaction presets, anomaly math, plan limits. |
| SDKs | `packages/sdk-*` | Buffered clients that wrap provider SDKs and ship traces with retries. Dependency-free where possible. |

## Request lifecycle

```mermaid
sequenceDiagram
  participant App
  participant SDK
  participant Ingest as ingest-api
  participant Redis
  participant Persist as worker/persist
  participant PG as TimescaleDB
  participant Evals as worker/evals
  App->>SDK: openai.chat.completions.create(...)
  SDK->>App: response (unchanged)
  SDK-->>SDK: buffer trace (id, latency, tokens, template)
  SDK->>Ingest: POST /v1/traces (batch, X-Regressa-Project-Key)
  Ingest->>Ingest: sha256(key) lookup (60s cache) · zod per item · budget sampling
  Ingest->>Redis: enqueue persist job
  Ingest-->>SDK: 202 {accepted, rejected, errors}
  Redis->>Persist: job
  Persist->>PG: upsert prompt_templates / prompt_versions (hash of normalized template)
  Persist->>Persist: redact PII per project rules
  Persist->>PG: INSERT traces ON CONFLICT DO NOTHING
  Persist->>Redis: eval jobs (sample_rate, template scope)
  Redis->>Evals: job
  Evals->>PG: INSERT eval_results
```

Idempotency: the ingest API assigns a UUID and timestamp to every trace before enqueueing. The primary key on
`traces` is `(id, created_at)`, so a retried persist job cannot duplicate rows.

## Prompt-version detection (the regression core)

Every trace may carry `prompt_template: { name, raw }`. The worker normalizes `raw` (CRLF to LF, trailing
whitespace trimmed, outer blank lines removed), hashes it with SHA-256, and upserts `prompt_versions` keyed by
`(template, hash)`. A new hash becomes version N+1 and fires `prompt_version_change` rules immediately. All
metrics (eval score, p95, error rate, cost) can then be compared per version, which is what the Prompts page,
the CI gate, and the anomaly detector use.

## Evals

| Type | Runs where | Cost |
|---|---|---|
| `llm_judge` | Anthropic Messages API with a forced `submit_score` tool call; 0-100 mapped to 0-1 | judge model tokens, recorded per result |
| `semantic_similarity` | OpenAI embeddings; best cosine similarity to cached golden embeddings | embedding tokens |
| `custom_function` | `node:vm` sandbox, 250ms timeout, no `require`/`process` | free |

Evals are sampled per definition (`sample_rate`) and optionally scoped to one template. The eval worker is
rate-limited to 60 jobs/minute by default to protect provider quotas.

## Alerting

Rules are evaluated every 60 seconds over rolling windows with per-rule cooldowns and minimum sample sizes.

| Condition | Semantics |
|---|---|
| `gt` / `lt` | current window vs absolute threshold |
| `pct_change` | current window vs the immediately preceding window |
| `anomaly` | z-score of the current window vs the previous 24 windows (5% stddev floor) |
| `budget` metric | month-to-date spend vs the project cap; also toggles ingest sampling |
| `prompt_version_change` | fired inline by the persist worker |

Notifications go through a separate queue with retries; delivery state is recorded on `alert_events`.

## Storage

- `traces` and `eval_results` are Timescale hypertables with 1-day chunks and a 90-day table-level retention
  policy. A per-project retention job enforces shorter plan or override windows.
- `traces_hourly` and `eval_scores_hourly` are continuous aggregates for long-range charts.
- Dashboard queries for the active range read the hypertables directly so the UI is always fresh.
- Timescale forbids foreign keys between hypertables, so `eval_results` references traces by
  `(trace_id, trace_created_at)` without a constraint.

See [docs/data-model.md](docs/data-model.md) for the table-by-table reference.

## Tenancy and security

- Hierarchy: `orgs -> projects -> api_keys -> traces`. Every dashboard query is scoped by the session's active
  project; every API and ingest query by the key's project. Project ids are never taken from user input.
- API keys are random 32-char base62 with an `rgsa_live_` / `rgsa_test_` prefix; only the SHA-256 is stored.
- Sessions are HMAC-signed cookies; passwords use scrypt with per-user salts; OIDC id_tokens are verified
  against the provider JWKS.
- PII redaction runs before anything is written. Custom eval code runs in a locked-down VM.
- Security-relevant actions are written to `audit_log`.

## Scaling notes

- Ingest is CPU-light JSON validation; 1 vCPU handles thousands of traces/second. Batch from the SDK.
- Persist concurrency defaults to 8 per worker replica; version upserts are the only contended writes.
- Move `traces` to compression after 7 days and adjust `chunk_time_interval` when daily volume exceeds ~10M rows.
- Redis needs persistence (AOF) so queued traces survive restarts.

## Repository layout

```
apps/            web, ingest-api, worker
packages/        db, shared-types, sdk-node (+ gate CLI), sdk-python, sdk-go, sdk-java
infra/           docker-compose (TimescaleDB, Redis), terraform stub
docs/            product and operator documentation (published to GitHub Pages)
.github/         CI, Pages deploy, reusable regressa-gate action
```
