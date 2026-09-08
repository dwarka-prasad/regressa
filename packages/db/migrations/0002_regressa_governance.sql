-- ============================================
-- REGRESSA SCHEMA — 0002 governance: budgets, redaction, retention, SSO, audit log, digests
-- ============================================
SET search_path TO regressa, public;

ALTER TABLE projects
    ADD COLUMN budget_monthly_usd   NUMERIC(12,2),                          -- NULL = no cap
    ADD COLUMN budget_action        TEXT NOT NULL DEFAULT 'alert',          -- alert | sample_10 (keep 10% of traces once exceeded)
    ADD COLUMN budget_exceeded_at   TIMESTAMPTZ,
    ADD COLUMN redaction_rules      JSONB NOT NULL DEFAULT '[]',            -- [{ name, pattern, replacement }]
    ADD COLUMN retention_days       INTEGER;                                -- NULL = plan default

ALTER TABLE orgs
    ADD COLUMN sso_domain           TEXT,                                   -- users with this email domain auto-join via OIDC
    ADD COLUMN sso_default_role     TEXT NOT NULL DEFAULT 'member',
    ADD COLUMN weekly_digest        BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN last_digest_at       TIMESTAMPTZ;

ALTER TABLE users
    ADD COLUMN oidc_sub             TEXT UNIQUE,
    ADD COLUMN last_login_at        TIMESTAMPTZ;

CREATE TABLE audit_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    project_id      UUID REFERENCES projects(id) ON DELETE SET NULL,
    actor_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
    actor_email     TEXT,
    action          TEXT NOT NULL,          -- e.g. api_key.create, member.invite, alert_rule.delete, auth.sso_login
    target          TEXT,                   -- human-readable target (key prefix, email, rule name)
    meta            JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_log_org_time ON audit_log (org_id, created_at DESC);
