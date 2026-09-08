import { describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import { hashApiKey } from "@regressa/db";
import { makeApiKeyAuth, type KeyContext } from "../../auth/apiKey.js";
import { applyBudgetSampling, normalizeBatch, tracesRoutes } from "./traces.js";

const VALID_KEY = "rgsa_test_abcdefghijklmnopqrstuvwxyz012345";
const CTX: KeyContext = { apiKeyId: "k1", projectId: "p1", orgId: "o1", plan: "pro", mode: "test" };
const trace = { model: "gpt-4o-mini", provider: "openai", input_messages: [{ role: "user", content: "hi" }], output_text: "hello" };

async function build(enqueue = vi.fn(async () => undefined)) {
  const app = Fastify();
  const lookup = vi.fn(async (hash: string) => (hash === hashApiKey(VALID_KEY) ? CTX : null));
  await app.register(async (v1) => {
    v1.addHook("preHandler", makeApiKeyAuth(lookup, { ttlMs: 60_000 }));
    await v1.register(tracesRoutes, { enqueue, maxBatch: 3 });
  });
  return { app, enqueue, lookup };
}

describe("normalizeBatch", () => {
  it("accepts a single trace object and assigns id + timestamp", () => {
    const r = normalizeBatch(trace, 100);
    expect(r.status).toBe(202);
    expect(r.accepted).toHaveLength(1);
    expect(r.accepted[0]!.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(r.accepted[0]!.timestamp).toBeTruthy();
    expect(r.accepted[0]!.status).toBe("success");
  });
  it("validates items individually", () => {
    const r = normalizeBatch({ traces: [{ model: "x" }, trace] }, 100);
    expect(r.status).toBe(202);
    expect(r.payload).toMatchObject({ accepted: 1, rejected: 1 });
    expect((r.payload as { errors: { index: number; message: string }[] }).errors[0]).toMatchObject({ index: 0 });
  });
  it("returns 422 when nothing is valid and 413 when over the batch cap", () => {
    expect(normalizeBatch({ traces: [{ nope: 1 }] }, 100).status).toBe(422);
    expect(normalizeBatch({ traces: [trace, trace, trace, trace] }, 3).status).toBe(413);
  });
  it("returns 400 for an envelope that is not an array", () => {
    expect(normalizeBatch({ traces: "x" }, 100).status).toBe(400);
  });
});

describe("POST /v1/traces", () => {
  it("rejects a missing or malformed key", async () => {
    const { app } = await build();
    expect((await app.inject({ method: "POST", url: "/v1/traces", payload: trace })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/v1/traces", payload: trace, headers: { "x-regressa-project-key": "nope" } })).statusCode).toBe(401);
  });
  it("rejects an unknown key", async () => {
    const { app, enqueue } = await build();
    const res = await app.inject({ method: "POST", url: "/v1/traces", payload: trace, headers: { "x-regressa-project-key": "rgsa_live_unknownunknownunknownunknown00" } });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "invalid_or_revoked_key" });
    expect(enqueue).not.toHaveBeenCalled();
  });
  it("enqueues a persist job scoped to the key's project", async () => {
    const { app, enqueue } = await build();
    const res = await app.inject({ method: "POST", url: "/v1/traces", payload: { traces: [trace, trace] }, headers: { "x-regressa-project-key": VALID_KEY } });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ accepted: 2, rejected: 0, errors: [] });
    expect(enqueue).toHaveBeenCalledTimes(1);
    const job = enqueue.mock.calls[0]![0] as { projectId: string; apiKeyId: string; traces: unknown[] };
    expect(job.projectId).toBe("p1");
    expect(job.apiKeyId).toBe("k1");
    expect(job.traces).toHaveLength(2);
  });
  it("accepts Authorization: Bearer and caches the lookup", async () => {
    const { app, lookup } = await build();
    for (let i = 0; i < 3; i++) {
      const res = await app.inject({ method: "POST", url: "/v1/traces", payload: trace, headers: { authorization: `Bearer ${VALID_KEY}` } });
      expect(res.statusCode).toBe(202);
    }
    expect(lookup).toHaveBeenCalledTimes(1);
  });
  it("does not enqueue when every item is invalid", async () => {
    const { app, enqueue } = await build();
    const res = await app.inject({ method: "POST", url: "/v1/traces", payload: { traces: [{ bad: true }] }, headers: { "x-regressa-project-key": VALID_KEY } });
    expect(res.statusCode).toBe(422);
    expect(enqueue).not.toHaveBeenCalled();
  });
});

describe("applyBudgetSampling", () => {
  const t = (meta: Record<string, unknown> = {}) => ({ ...trace, status: "success" as const, metadata: meta });
  it("passes everything through when not over budget or when the action is alert-only", () => {
    expect(applyBudgetSampling([t(), t()], { budgetExceeded: false }).dropped).toBe(0);
    expect(applyBudgetSampling([t(), t()], { budgetExceeded: true, budgetAction: "alert" }).dropped).toBe(0);
  });
  it("keeps roughly 10% when over budget with sample_10, and always keeps CI gate runs", () => {
    let i = 0;
    const random = () => (i++ % 10) / 10; // 0.0, 0.1, ... deterministic
    const batch = [...Array.from({ length: 10 }, () => t()), t({ regressa_run: "ci-1" })];
    const r = applyBudgetSampling(batch, { budgetExceeded: true, budgetAction: "sample_10" }, random);
    expect(r.kept.length).toBe(2); // one random keep (0.0 < 0.1) + the CI run
    expect(r.dropped).toBe(9);
    expect(r.kept.some((k) => k.metadata?.regressa_run === "ci-1")).toBe(true);
  });
});
