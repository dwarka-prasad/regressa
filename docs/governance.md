# Governance: budgets, redaction, retention, SSO, audit

All settings live under Settings and apply per project (budget, redaction, retention) or per org (SSO, digests).

## Budget caps
Set a monthly USD budget per project. Create an alert rule with metric **Monthly budget** to be notified; the
worker checks spend every minute and flips `projects.budget_exceeded_at` once. With action **sample 10%**, the
ingest API keeps 10% of traces for the rest of the month and answers with `X-Regressa-Budget: exceeded; sampled N`.
CI gate runs (`metadata.regressa_run`) are never dropped. The flag clears automatically when the month resets or the budget is raised.

## Anomaly alerts
Alert condition **anomaly** compares the current window against the previous 24 windows of the same length.
The threshold is the z-score cutoff (default 3). For eval score only drops are anomalies; for cost, latency and
error rate only rises are. A flat history gets a 5% floor on the standard deviation so tiny blips do not fire.

## PII redaction
Redaction runs in the worker before anything is written. Enable presets (email, phone, credit card, SSN, IPv4,
API keys) or add custom rules as `name ||| regex ||| replacement`. Rules apply to input messages, output, error
message and metadata. Invalid regexes are rejected on save.

## Retention
Plan defaults: free 7d, pro 30d, team 90d, enterprise 365d. A project may set a shorter override. An hourly
maintenance job deletes traces and eval results past the effective retention.

## SSO (OIDC)
Set `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`; the login page shows **Continue with SSO**.
Redirect URI: `<NEXTAUTH_URL>/api/auth/oidc/callback`. id_tokens are verified against the provider JWKS.
Users are matched by `oidc_sub`, then email. Set an **SSO email domain** on the org so matching users auto-join
with the default role.

## Weekly digest
Owners and admins receive a weekly per-project summary email (requests, cost, p95, errors, eval score, prompt
changes, alerts) when `SMTP_URL` is set and the org toggle is on.

## Audit log
Security-relevant actions (keys, members, rules, evals, governance, SSO, logins, playground runs) are recorded
in `regressa.audit_log` and shown under Settings.

## OpenTelemetry ingestion
`POST /v1/otlp/traces` on the ingest API accepts OTLP/HTTP JSON with the same `X-Regressa-Project-Key` header.
Spans carrying `gen_ai.request.model` become traces; `gen_ai.system`, `gen_ai.usage.*`, prompt and completion
events, span status and duration are mapped. Add `regressa.prompt_template.name` / `regressa.prompt_template.raw`
attributes for version tracking and `regressa.meta.*` for metadata.
