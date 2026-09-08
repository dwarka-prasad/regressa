# Regressa

> Catch AI regressions before your users do.

**Site and docs:** https://dwarka-prasad.github.io/regressa/ · **Architecture:** [ARCHITECTURE.md](ARCHITECTURE.md) · **CI:** ![CI](https://github.com/dwarka-prasad/regressa/actions/workflows/ci.yml/badge.svg)

Regressa is an LLM observability and prompt-regression monitoring platform. Teams install a lightweight SDK
(`@regressa/node` or `regressa-sdk` on PyPI) that wraps their OpenAI / Anthropic calls. Every call is logged with
prompt, response, model, tokens, cost, latency and a content hash of the prompt template. Regressa detects
prompt-template version changes, scores output quality with automated evals, and alerts on quality drops,
cost spikes, or latency degradation.

## Monorepo layout

```
apps/
  web/          Next.js 14 dashboard (App Router)
  ingest-api/   Fastify ingestion service  (POST /v1/traces)
  worker/       BullMQ workers: trace persistence, eval runner, alert evaluator
packages/
  db/           SQL migrations (Timescale) + Drizzle schema + typed client
  shared-types/ Zod schemas shared by SDKs, ingest API and dashboard
  sdk-node/     npm  @regressa/node
  sdk-python/   pip  regressa-sdk
  sdk-go/       go   github.com/dwarka-prasad/regressa-go
  sdk-java/     mvn  dev.regressa:regressa-sdk
infra/
  docker-compose.yml   local TimescaleDB + Redis
  terraform/           cloud infra (stub)
docs/
```

## Documentation

| | |
|---|---|
| [Architecture](ARCHITECTURE.md) | components, data flow, versioning, alerting, storage, tenancy |
| [Data model](docs/data-model.md) | every table and the metadata conventions |
| [SDKs](docs/sdks.md) | Node, Python, Go, Java, OpenTelemetry |
| [Ingestion API](docs/ingest-api.md) · [Public API](docs/public-api.md) | wire formats |
| [Evals](docs/evals.md) · [Alerts](docs/alerts.md) · [CI gate](docs/ci-gate.md) | quality scoring and regression detection |
| [Governance](docs/governance.md) · [Security](docs/security.md) | budgets, redaction, retention, SSO, audit |
| [Deployment](docs/deployment.md) · [Local development](docs/local-dev.md) · [Contributing](CONTRIBUTING.md) | running it |

## Quick start

```bash
cp .env.example .env
pnpm install
pnpm infra:up          # TimescaleDB on :5433, Redis on :6380
pnpm db:migrate
pnpm db:seed           # creates a demo org/project and prints an API key
pnpm dev               # web :3100, ingest-api :4100, worker
```

Send a trace:

```bash
curl -X POST http://localhost:4100/v1/traces \
  -H "Content-Type: application/json" \
  -H "X-Regressa-Project-Key: rgsa_test_..." \
  -d '{"traces":[{"model":"gpt-4o-mini","provider":"openai","input_messages":[{"role":"user","content":"hi"}],"output_text":"hello","prompt_tokens":3,"completion_tokens":2,"latency_ms":420,"prompt_template":{"name":"greeting","raw":"Say hi to {{name}}"}}]}'
```

## Testing

```bash
pnpm test            # vitest in every package (turbo), ~80 unit tests
pnpm typecheck       # tsc across the workspace
pnpm test:py         # Python SDK (pytest) - needs packages/sdk-python/.venv
pnpm ci              # typecheck + test, what .github/workflows/ci.yml runs
```

Per package: `pnpm --filter @regressa/worker test`, or `npx vitest` inside a package for watch mode.
Unit tests never touch Postgres or Redis: the ingest route takes an injectable key lookup and queue, the alert
engine mocks its metrics module, and the web tests cover pure libs plus React components under jsdom.

## Dashboard

Light/dark theme (toggle in the top bar), global 24h / 7d / 30d range, project switcher, search across trace
output, and pages for Overview (period-over-period deltas, onboarding checklist, prompt-change feed), Traces,
Prompts (per-version regression table plus a line diff between versions), Evals (score histogram, live results
feed), Alerts (rules, events, one-click test notification), Costs (by model and template) and Settings
(API keys, members and roles, plan usage, projects).

## Governance and integrations

Budget caps with over-budget sampling, anomaly alerts, PII redaction at ingest, per-project retention, OIDC SSO,
audit log, weekly digest email, a prompt playground, a CI regression gate (`npx @regressa/node gate`, plus a
GitHub Action), OpenTelemetry ingestion, and SDKs for Node, Python, Go and Java. See `docs/governance.md` and `docs/ci-gate.md`.

## Branding touchpoints

| Thing | Value |
|---|---|
| npm package | `@regressa/node` |
| PyPI package | `regressa-sdk` |
| API key prefix | `rgsa_live_…` / `rgsa_test_…` |
| DB name | `regressa_production` / `regressa_dev` / `regressa_test` |
| SDK auth header | `X-Regressa-Project-Key` |
| Docs | `docs.regressa.dev` |
