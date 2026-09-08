-- ============================================
-- REGRESSA SCHEMA — 0001 core
-- ============================================
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS regressa;
SET search_path TO regressa, public;

-- ============================================
-- TENANCY: Orgs, Users, Projects, API Keys
-- ============================================
CREATE TABLE orgs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                TEXT NOT NULL,
    slug                TEXT UNIQUE NOT NULL,
    plan                TEXT NOT NULL DEFAULT 'free',     -- free | pro | team | enterprise
    stripe_customer_id  TEXT,
    stripe_subscription_id TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           TEXT UNIQUE NOT NULL,
    name            TEXT,
    password_hash   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE org_members (
    org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role            TEXT NOT NULL DEFAULT 'member',       -- owner | admin | member
    PRIMARY KEY (org_id, user_id)
);

CREATE TABLE projects (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    slug            TEXT NOT NULL,
    environment     TEXT NOT NULL DEFAULT 'production',  -- production | staging | development
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (org_id, slug)
);

CREATE TABLE api_keys (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    key_hash        TEXT UNIQUE NOT NULL,     -- sha256, never store plaintext
    key_prefix      TEXT NOT NULL,            -- shown in UI, e.g. "rgsa_live_8x2..."
    mode            TEXT NOT NULL DEFAULT 'live',  -- live | test
    label           TEXT,
    last_used_at    TIMESTAMPTZ,
    revoked_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_api_keys_project ON api_keys (project_id);

-- ============================================
-- PROMPT TEMPLATES & VERSIONING (regression-detection core)
-- ============================================
CREATE TABLE prompt_templates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (project_id, name)
);

CREATE TABLE prompt_versions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prompt_template_id  UUID NOT NULL REFERENCES prompt_templates(id) ON DELETE CASCADE,
    version_number      INTEGER NOT NULL,
    content_hash        TEXT NOT NULL,        -- sha256 of normalized template
    raw_template        TEXT NOT NULL,
    first_seen_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (prompt_template_id, content_hash),
    UNIQUE (prompt_template_id, version_number)
);

-- ============================================
-- TRACES (Timescale hypertable, high volume)
-- ============================================
CREATE TABLE traces (
    id                  UUID NOT NULL DEFAULT gen_random_uuid(),
    project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    prompt_version_id   UUID REFERENCES prompt_versions(id),

    model               TEXT NOT NULL,
    provider            TEXT NOT NULL,       -- anthropic | openai | other
    input_messages      JSONB NOT NULL,
    output_text         TEXT,

    prompt_tokens       INTEGER,
    completion_tokens   INTEGER,
    total_cost_usd      NUMERIC(10,6),
    latency_ms          INTEGER,
    status              TEXT NOT NULL DEFAULT 'success',   -- success | error | timeout
    error_message       TEXT,

    trace_group_id      TEXT,                -- optional: correlate multi-call workflows
    metadata            JSONB NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    PRIMARY KEY (id, created_at)
);

SELECT create_hypertable('traces', 'created_at', chunk_time_interval => INTERVAL '1 day');

CREATE INDEX idx_traces_project_time     ON traces (project_id, created_at DESC);
CREATE INDEX idx_traces_prompt_version   ON traces (prompt_version_id, created_at DESC);
CREATE INDEX idx_traces_status           ON traces (project_id, status, created_at DESC) WHERE status != 'success';
CREATE INDEX idx_traces_metadata_gin     ON traces USING GIN (metadata);
CREATE INDEX idx_traces_group            ON traces (trace_group_id) WHERE trace_group_id IS NOT NULL;

-- ============================================
-- EVALS
-- ============================================
CREATE TABLE eval_definitions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    prompt_template_id  UUID REFERENCES prompt_templates(id) ON DELETE SET NULL, -- NULL = applies to all
    name                TEXT NOT NULL,
    type                TEXT NOT NULL,      -- semantic_similarity | llm_judge | custom_function
    config              JSONB NOT NULL,
    sample_rate         NUMERIC(4,3) NOT NULL DEFAULT 1.0,   -- 0.0–1.0 fraction of traces to eval
    is_active           BOOLEAN NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_eval_defs_project ON eval_definitions (project_id) WHERE is_active;

-- Golden set: reference outputs for semantic-similarity evals
CREATE TABLE golden_examples (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    eval_definition_id  UUID NOT NULL REFERENCES eval_definitions(id) ON DELETE CASCADE,
    input_messages      JSONB NOT NULL,
    expected_output     TEXT NOT NULL,
    embedding           REAL[],           -- cached embedding of expected_output
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE eval_results (
    id                  UUID NOT NULL DEFAULT gen_random_uuid(),
    trace_id            UUID NOT NULL,
    trace_created_at    TIMESTAMPTZ NOT NULL,
    project_id          UUID NOT NULL,
    eval_definition_id  UUID NOT NULL REFERENCES eval_definitions(id) ON DELETE CASCADE,
    score               NUMERIC(5,4),          -- 0.0–1.0
    passed              BOOLEAN,
    reasoning           TEXT,
    eval_cost_usd       NUMERIC(10,6),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- NOTE: no FK to traces(id, created_at): Timescale forbids hypertable -> hypertable foreign keys.
    -- Both tables share the same retention policy, so orphaned eval results are bounded to the retention window.
    PRIMARY KEY (id, created_at)
);

SELECT create_hypertable('eval_results', 'created_at', chunk_time_interval => INTERVAL '1 day');
CREATE INDEX idx_eval_results_def_time ON eval_results (eval_definition_id, created_at DESC);
CREATE INDEX idx_eval_results_trace    ON eval_results (trace_id);
CREATE INDEX idx_eval_results_project  ON eval_results (project_id, created_at DESC);

-- ============================================
-- ALERTS
-- ============================================
CREATE TABLE alert_rules (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,
    metric              TEXT NOT NULL,       -- cost | latency_p95 | error_rate | eval_score | prompt_version_change
    condition           TEXT NOT NULL,       -- gt | lt | pct_change | any
    threshold           NUMERIC NOT NULL DEFAULT 0,
    window_minutes      INTEGER NOT NULL DEFAULT 60,
    prompt_template_id  UUID REFERENCES prompt_templates(id) ON DELETE SET NULL,
    eval_definition_id  UUID REFERENCES eval_definitions(id) ON DELETE SET NULL,
    channel             TEXT NOT NULL,       -- slack | email | webhook
    channel_config      JSONB NOT NULL,
    cooldown_minutes    INTEGER NOT NULL DEFAULT 60,
    is_active           BOOLEAN NOT NULL DEFAULT true,
    last_triggered_at   TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_alert_rules_project ON alert_rules (project_id) WHERE is_active;

CREATE TABLE alert_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_rule_id   UUID NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    triggered_value NUMERIC NOT NULL,
    baseline_value  NUMERIC,
    message         TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'open',   -- open | acknowledged | resolved
    notified_at     TIMESTAMPTZ,
    notify_error    TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_alert_events_project_time ON alert_events (project_id, created_at DESC);

-- ============================================
-- CONTINUOUS AGGREGATES
-- ============================================
CREATE MATERIALIZED VIEW traces_hourly
WITH (timescaledb.continuous) AS
SELECT
    project_id,
    prompt_version_id,
    model,
    time_bucket('1 hour', created_at) AS bucket,
    count(*)                           AS request_count,
    sum(total_cost_usd)                AS total_cost,
    sum(prompt_tokens)                 AS prompt_tokens,
    sum(completion_tokens)             AS completion_tokens,
    avg(latency_ms)                    AS avg_latency_ms,
    percentile_agg(latency_ms)         AS latency_pct_agg,
    count(*) FILTER (WHERE status != 'success') AS error_count
FROM traces
GROUP BY project_id, prompt_version_id, model, bucket
WITH NO DATA;

SELECT add_continuous_aggregate_policy('traces_hourly',
    start_offset      => INTERVAL '3 days',
    end_offset        => INTERVAL '1 hour',
    schedule_interval => INTERVAL '15 minutes');

CREATE MATERIALIZED VIEW eval_scores_hourly
WITH (timescaledb.continuous) AS
SELECT
    project_id,
    eval_definition_id,
    time_bucket('1 hour', created_at) AS bucket,
    count(*)                           AS eval_count,
    avg(score)                         AS avg_score,
    count(*) FILTER (WHERE passed)     AS pass_count
FROM eval_results
GROUP BY project_id, eval_definition_id, bucket
WITH NO DATA;

SELECT add_continuous_aggregate_policy('eval_scores_hourly',
    start_offset      => INTERVAL '3 days',
    end_offset        => INTERVAL '1 hour',
    schedule_interval => INTERVAL '15 minutes');

-- Retention: raw traces kept 90 days by default (plan-dependent later)
SELECT add_retention_policy('traces',       INTERVAL '90 days');
SELECT add_retention_policy('eval_results', INTERVAL '90 days');
