# Public REST API

Served by the dashboard app under `/api/v1/*`, authenticated with the same `X-Regressa-Project-Key` header.

| endpoint | description |
|---|---|
| `GET /api/v1/traces?limit&offset&since&status&model` | recent traces with template/version |
| `GET /api/v1/prompt-templates` | templates with per-version stats (requests, avg eval score, p95, error rate, cost) |
| `GET /api/v1/eval-results?eval_definition_id&since` | scored eval results |
| `GET /api/v1/alert-events?status&since` | fired alerts |
| `GET /api/v1/stats?range=24h|7d|30d` | current and previous-period totals (requests, cost, p95, error rate, eval score) |

All list endpoints return `{ data: [...], limit, offset }`. `limit` caps at 200.
