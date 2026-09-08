# Ingestion API

`POST /v1/traces` on the ingest service (default `http://localhost:4100`).

Headers: `X-Regressa-Project-Key: rgsa_live_...` (or `Authorization: Bearer rgsa_...`).

Body: either a single trace object or `{ "traces": [ ... ], "sdk": { "name", "version" } }` (max 500 per batch).

Trace fields:

| field | type | notes |
|---|---|---|
| id | uuid | optional; client-generated for idempotent retries |
| timestamp | ISO 8601 | optional; defaults to server time |
| model | string | required |
| provider | `openai` / `anthropic` / `other` | required |
| input_messages | `[{role, content}]` | required |
| output_text | string or null | |
| prompt_tokens / completion_tokens | int | |
| total_cost_usd | number | optional; estimated from model pricing if omitted |
| latency_ms | int | |
| status | `success` / `error` / `timeout` | default success |
| error_message | string | |
| trace_group_id | string | correlate multi-call workflows |
| prompt_template | `{ name, raw }` | enables version tracking |
| metadata | object | free-form, GIN indexed |

Responses: `202 { accepted, rejected, errors[] }`, `401` bad key, `413` batch too large, `422` nothing valid, `429` rate limited.
