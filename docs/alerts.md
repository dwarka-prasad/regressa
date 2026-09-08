# Alerts

Rules are evaluated every 60 seconds (worker `regressa-alerts`).

| metric | value |
|---|---|
| `cost` | USD spent in the window |
| `latency_p95` | p95 latency (ms) in the window |
| `error_rate` | non-success / total (0-1) |
| `eval_score` | avg eval score (optionally one eval definition) |
| `prompt_version_change` | fires immediately when a template hash changes (handled by the persist worker) |

Conditions: `gt`, `lt`, `pct_change` (current window vs the immediately preceding window; for `eval_score` a
drop is the regression, for everything else a rise). Rules have a cooldown and minimum sample counts to avoid noise.

Channels: `slack` (incoming webhook), `webhook` (JSON POST, optional `X-Regressa-Signature` HMAC-SHA256), `email` (SMTP, TODO).
