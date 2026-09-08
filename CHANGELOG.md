# Changelog

## 0.1.0 - 2026-09-09

Initial release.

- Ingest API with project-key auth, per-item validation, budget sampling, OTLP ingestion
- Worker: persistence with prompt-version detection and PII redaction; LLM-judge, golden-set and custom evals;
  alert engine with threshold, percent-change, anomaly and budget rules; Slack, webhook and SMTP notifications;
  retention and weekly digests
- Dashboard: overview, traces, prompts with version diff, evals, alerts, playground, costs, settings with
  members, governance, SSO and audit log; light and dark themes
- Public REST API and CI regression gate (`GET /api/v1/gate`, `npx @regressa/node gate`, GitHub Action)
- SDKs for Node, Python, Go and Java
