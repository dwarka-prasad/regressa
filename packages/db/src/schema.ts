/**
 * Drizzle schema for Regressa. Mirrors migrations/*.sql — the SQL is the source of truth
 * (Timescale hypertables and continuous aggregates aren't expressible in Drizzle).
 */
import {
  pgSchema, uuid, text, timestamp, integer, numeric, boolean, jsonb, primaryKey, real,
} from "drizzle-orm/pg-core";

export const regressa = pgSchema("regressa");

export const orgs = regressa.table("orgs", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  plan: text("plan").notNull().default("free"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  ssoDomain: text("sso_domain"),
  ssoDefaultRole: text("sso_default_role").notNull().default("member"),
  weeklyDigest: boolean("weekly_digest").notNull().default(true),
  lastDigestAt: timestamp("last_digest_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = regressa.table("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  passwordHash: text("password_hash"),
  oidcSub: text("oidc_sub").unique(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const orgMembers = regressa.table(
  "org_members",
  {
    orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.userId] })],
);

export const projects = regressa.table("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  environment: text("environment").notNull().default("production"),
  budgetMonthlyUsd: numeric("budget_monthly_usd", { precision: 12, scale: 2 }),
  budgetAction: text("budget_action").notNull().default("alert"),
  budgetExceededAt: timestamp("budget_exceeded_at", { withTimezone: true }),
  redactionRules: jsonb("redaction_rules").notNull().default([]),
  retentionDays: integer("retention_days"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const apiKeys = regressa.table("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  keyHash: text("key_hash").notNull().unique(),
  keyPrefix: text("key_prefix").notNull(),
  mode: text("mode").notNull().default("live"),
  label: text("label"),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const promptTemplates = regressa.table("prompt_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const promptVersions = regressa.table("prompt_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  promptTemplateId: uuid("prompt_template_id").notNull().references(() => promptTemplates.id, { onDelete: "cascade" }),
  versionNumber: integer("version_number").notNull(),
  contentHash: text("content_hash").notNull(),
  rawTemplate: text("raw_template").notNull(),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
});

export const traces = regressa.table(
  "traces",
  {
    id: uuid("id").notNull().defaultRandom(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    promptVersionId: uuid("prompt_version_id").references(() => promptVersions.id),
    model: text("model").notNull(),
    provider: text("provider").notNull(),
    inputMessages: jsonb("input_messages").notNull(),
    outputText: text("output_text"),
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
    totalCostUsd: numeric("total_cost_usd", { precision: 10, scale: 6 }),
    latencyMs: integer("latency_ms"),
    status: text("status").notNull().default("success"),
    errorMessage: text("error_message"),
    traceGroupId: text("trace_group_id"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.id, t.createdAt] })],
);

export const evalDefinitions = regressa.table("eval_definitions", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  promptTemplateId: uuid("prompt_template_id").references(() => promptTemplates.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  type: text("type").notNull(),
  config: jsonb("config").notNull(),
  sampleRate: numeric("sample_rate", { precision: 4, scale: 3 }).notNull().default("1.0"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const goldenExamples = regressa.table("golden_examples", {
  id: uuid("id").primaryKey().defaultRandom(),
  evalDefinitionId: uuid("eval_definition_id").notNull().references(() => evalDefinitions.id, { onDelete: "cascade" }),
  inputMessages: jsonb("input_messages").notNull(),
  expectedOutput: text("expected_output").notNull(),
  embedding: real("embedding").array(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const evalResults = regressa.table(
  "eval_results",
  {
    id: uuid("id").notNull().defaultRandom(),
    traceId: uuid("trace_id").notNull(),
    traceCreatedAt: timestamp("trace_created_at", { withTimezone: true }).notNull(),
    projectId: uuid("project_id").notNull(),
    evalDefinitionId: uuid("eval_definition_id").notNull().references(() => evalDefinitions.id, { onDelete: "cascade" }),
    score: numeric("score", { precision: 5, scale: 4 }),
    passed: boolean("passed"),
    reasoning: text("reasoning"),
    evalCostUsd: numeric("eval_cost_usd", { precision: 10, scale: 6 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.id, t.createdAt] })],
);

export const alertRules = regressa.table("alert_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  metric: text("metric").notNull(),
  condition: text("condition").notNull(),
  threshold: numeric("threshold").notNull().default("0"),
  windowMinutes: integer("window_minutes").notNull().default(60),
  promptTemplateId: uuid("prompt_template_id").references(() => promptTemplates.id, { onDelete: "set null" }),
  evalDefinitionId: uuid("eval_definition_id").references(() => evalDefinitions.id, { onDelete: "set null" }),
  channel: text("channel").notNull(),
  channelConfig: jsonb("channel_config").notNull(),
  cooldownMinutes: integer("cooldown_minutes").notNull().default(60),
  isActive: boolean("is_active").notNull().default(true),
  lastTriggeredAt: timestamp("last_triggered_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const alertEvents = regressa.table("alert_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  alertRuleId: uuid("alert_rule_id").notNull().references(() => alertRules.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  triggeredValue: numeric("triggered_value").notNull(),
  baselineValue: numeric("baseline_value"),
  message: text("message").notNull(),
  status: text("status").notNull().default("open"),
  notifiedAt: timestamp("notified_at", { withTimezone: true }),
  notifyError: text("notify_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLog = regressa.table("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  actorEmail: text("actor_email"),
  action: text("action").notNull(),
  target: text("target"),
  meta: jsonb("meta").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
