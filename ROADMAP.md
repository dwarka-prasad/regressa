# Roadmap

Regressa 0.1 shipped the full pipeline: ingest, versioning, evals, alerts, dashboard, CI gate, governance and four SDKs.
This is the plan for what comes next. Every item is a GitHub issue; ones tagged **help wanted** are open to collaborators and
**good first issue** marks small, well-scoped starting points. Comment on an issue to claim it.

Milestones: [0.2 Hosted beta](https://github.com/dwarka-prasad/regressa/milestone/1) · [0.3 Quality workflows](https://github.com/dwarka-prasad/regressa/milestone/2) · [0.4 Enterprise](https://github.com/dwarka-prasad/regressa/milestone/3)

## 0.2 Hosted beta

_Run Regressa for real users: deployment, billing enforcement, auth hardening, published SDKs._ Target: 2026-10-15.

| # | Task | Labels |
|---|---|---|
| [#1](https://github.com/dwarka-prasad/regressa/issues/1) | Hosted deployment: Timescale Cloud + Redis + container host, Terraform | help wanted |
| [#2](https://github.com/dwarka-prasad/regressa/issues/2) | Enforce plan limits at ingest (traces/month) and surface usage in the UI | core team |
| [#3](https://github.com/dwarka-prasad/regressa/issues/3) | Stripe: real price ids, customer portal, webhook coverage for upgrades and downgrades | help wanted |
| [#4](https://github.com/dwarka-prasad/regressa/issues/4) | Password reset and email verification | help wanted |
| [#5](https://github.com/dwarka-prasad/regressa/issues/5) | Publish SDKs: npm @regressa/node, PyPI regressa-sdk, Go module tag, Maven Central | core team |
| [#6](https://github.com/dwarka-prasad/regressa/issues/6) | Integration tests against real Postgres/Redis in CI | help wanted |
| [#7](https://github.com/dwarka-prasad/regressa/issues/7) | Playwright end-to-end tests for the dashboard | help wanted, good first issue |
| [#8](https://github.com/dwarka-prasad/regressa/issues/8) | Self-host Inter and JetBrains Mono so `next build` works offline | good first issue, help wanted |
| [#9](https://github.com/dwarka-prasad/regressa/issues/9) | Rate limit the public REST API and gate endpoint per key | help wanted |

## 0.3 Quality workflows

_Golden set management, playground compare, template registry, datasets export, OTel depth._ Target: 2026-11-30.

| # | Task | Labels |
|---|---|---|
| [#10](https://github.com/dwarka-prasad/regressa/issues/10) | Golden set management UI: add examples from traces, edit, re-embed | core team |
| [#11](https://github.com/dwarka-prasad/regressa/issues/11) | Playground: compare against a stored version and save runs as traces | core team |
| [#12](https://github.com/dwarka-prasad/regressa/issues/12) | Prompt template registry API: fetch the current template at runtime | core team |
| [#13](https://github.com/dwarka-prasad/regressa/issues/13) | Export traces, eval results and golden sets as JSONL/CSV | good first issue, help wanted |
| [#14](https://github.com/dwarka-prasad/regressa/issues/14) | Trace groups view for multi-call workflows | help wanted |
| [#15](https://github.com/dwarka-prasad/regressa/issues/15) | Use continuous aggregates for 7d/30d dashboard ranges | help wanted |
| [#16](https://github.com/dwarka-prasad/regressa/issues/16) | OpenTelemetry: gRPC receiver, protobuf OTLP, and tool-call spans | help wanted |
| [#20](https://github.com/dwarka-prasad/regressa/issues/20) | Accessibility and responsive pass on the dashboard | good first issue, help wanted |

## 0.4 Enterprise

_Slack app, SSO groups, RBAC, audit export, seasonality-aware anomalies, i18n._ Target: 2027-01-31.

| # | Task | Labels |
|---|---|---|
| [#17](https://github.com/dwarka-prasad/regressa/issues/17) | Slack app: interactive acknowledge and resolve, OAuth install | help wanted |
| [#18](https://github.com/dwarka-prasad/regressa/issues/18) | Anomaly detection: seasonality-aware baselines and per-template thresholds | core team |
| [#19](https://github.com/dwarka-prasad/regressa/issues/19) | RBAC: project-level roles and SSO group mapping | core team |

## How work flows

1. Pick an issue, comment to claim it, ask questions there.
2. Branch from `main`, keep PRs focused, add tests next to the code (see CONTRIBUTING.md).
3. CI must be green: typecheck, vitest, pytest, go test, mvn test, production `next build`.
4. A maintainer reviews within a few days. Docs changes redeploy the site automatically.

## Not planned

- A hosted free tier before 0.2 lands.
- Support for providers beyond OpenAI and Anthropic in the wrappers (use `regressa.trace()` or OTLP instead) until demand shows up.
