import { describe, expect, it, vi } from "vitest";
vi.mock("../queues.js", () => ({ connection: {}, maintenanceQueue: { upsertJobScheduler: vi.fn() }, notifyQueue: {}, tracesQueue: {}, evalsQueue: {}, alertsQueue: {} }));
import { effectiveRetentionDays, renderDigest } from "./maintenanceWorker.js";
import { redactTrace, seedRedactionRules } from "../persist/tracesWorker.js";
import { REDACTION_PRESETS } from "@regressa/shared-types";

describe("effectiveRetentionDays", () => {
  it("uses the plan maximum when no override is set and caps overrides at the plan", () => {
    expect(effectiveRetentionDays("free", null)).toBe(7);
    expect(effectiveRetentionDays("pro", 14)).toBe(14);
    expect(effectiveRetentionDays("pro", 365)).toBe(30);
    expect(effectiveRetentionDays("team", 0)).toBe(90);
  });
});

describe("renderDigest", () => {
  it("summarizes totals in the subject and lists each project", () => {
    const d = renderDigest("Acme", [
      { project: "Support Bot", requests: 1200, cost: 3.5, p95: 800, errorRate: 0.02, evalScore: 0.83, newVersions: 2, alerts: 1 },
      { project: "Search", requests: 300, cost: 1.25, p95: 400, errorRate: 0, evalScore: null, newVersions: 0, alerts: 0 },
    ], "https://app.regressa.dev");
    expect(d.subject).toBe("Regressa weekly: Acme - 1,500 requests, $4.75");
    expect(d.text).toContain("Support Bot: 1200 req, $3.50, p95 800ms, errors 2.0%, eval 0.83, 2 prompt change(s), 1 alert(s)");
    expect(d.html).toContain("<td>Search</td>");
    expect(d.html).toContain("n/a");
    expect(d.html).toContain("https://app.regressa.dev/overview");
  });
  it("escapes html in names", () => {
    expect(renderDigest("<script>", [], "u").html).toContain("&lt;script&gt;");
  });
});

describe("redactTrace", () => {
  it("scrubs messages, output, error and metadata", () => {
    seedRedactionRules("p1", [REDACTION_PRESETS.find((r) => r.name === "email")!]);
    const t = redactTrace({
      model: "m", provider: "openai", status: "error", input_messages: [{ role: "user", content: "I am ada@x.io" }],
      output_text: "Sure ada@x.io", error_message: "failed for ada@x.io", metadata: { user: "ada@x.io", n: 1 },
    }, [REDACTION_PRESETS.find((r) => r.name === "email")!]);
    expect(JSON.stringify(t)).not.toContain("ada@x.io");
    expect(t.metadata).toEqual({ user: "[EMAIL]", n: 1 });
  });
  it("is a no-op without rules", () => {
    const input = { model: "m", provider: "openai" as const, status: "success" as const, input_messages: [], metadata: {} };
    expect(redactTrace(input, [])).toBe(input);
  });
});
