import { describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { buildTestPayload, sendTestNotification, signPayload } from "../notify";

describe("notify", () => {
  it("signs payloads with HMAC-SHA256", () => {
    const body = JSON.stringify({ a: 1 });
    expect(signPayload(body, "s3cret")).toBe("sha256=" + createHmac("sha256", "s3cret").update(body).digest("hex"));
  });
  it("builds Slack blocks for slack and a typed JSON event otherwise", () => {
    const slack = buildTestPayload("slack", { ruleName: "R", projectName: "P", url: "u" }) as { blocks: unknown[] };
    expect(slack.blocks).toHaveLength(2);
    const hook = buildTestPayload("webhook", { ruleName: "R", projectName: "P", url: "u" }) as { type: string };
    expect(hook.type).toBe("regressa.alert.test");
  });
  it("posts to the configured url with a signature and reports HTTP failures", async () => {
    const f = vi.fn(async () => new Response("ok", { status: 200 })) as unknown as typeof fetch;
    const r = await sendTestNotification("webhook", { url: "https://x.test/hook", secret: "k" }, { ruleName: "R", projectName: "P" }, f);
    expect(r.ok).toBe(true);
    const [url, init] = (f as any).mock.calls[0];
    expect(url).toBe("https://x.test/hook");
    expect(init.headers["X-Regressa-Signature"]).toMatch(/^sha256=/);
    const bad = vi.fn(async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
    expect(await sendTestNotification("slack", { webhook_url: "https://x" }, { ruleName: "R", projectName: "P" }, bad)).toEqual({ ok: false, error: "HTTP 500" });
  });
  it("fails fast on missing config and unsupported email", async () => {
    expect((await sendTestNotification("webhook", {}, { ruleName: "R", projectName: "P" })).ok).toBe(false);
    expect((await sendTestNotification("email", { to: "a@b" }, { ruleName: "R", projectName: "P" })).error).toMatch(/SMTP/);
  });
});
