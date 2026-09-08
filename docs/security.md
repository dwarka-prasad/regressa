# Security

## Authentication and authorization

- Dashboard sessions: HMAC-SHA256 signed cookies (`regressa_session`), 30-day expiry, `httpOnly`, `sameSite=lax`,
  `secure` in production. Passwords hashed with scrypt (N=16384, per-user 16-byte salt).
- SSO: OIDC authorization code flow. id_tokens are verified against the provider JWKS with issuer and audience
  checks and a nonce. Users are matched by `oidc_sub`, then email. Org auto-join is by verified email domain.
- Roles: owner (billing, SSO, org rename, member removal), admin (projects, keys, members, governance), member (read and operate).
- API keys: 256-bit random, shown once, stored as SHA-256. Revocation is immediate (60s cache on ingest).

## Data handling

- PII redaction rules run in the worker before persistence; nothing unredacted reaches disk when rules are on.
- Custom eval functions execute in `node:vm` with `codeGeneration` disabled, no `require`, no `process`, and a 250ms timeout.
- Alert webhooks are signed with `X-Regressa-Signature: sha256=<hmac>` when a secret is configured.
- Budget caps can throttle ingestion to 10% to bound spend.
- Every security-relevant action is written to `audit_log` with the actor and target.

## Tenancy isolation

All reads and writes are scoped by `project_id` derived from the session or the API key. No endpoint accepts a
project id from the caller. Cross-project references (templates, evals in alert rules) are validated against the
active project before use.

## Reporting a vulnerability

Email security@regressa.dev. Please do not open public issues for security reports. We aim to acknowledge within
two business days.
