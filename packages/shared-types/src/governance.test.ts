import { describe, expect, it } from "vitest";
import { REDACTION_PRESETS, redactText, redactValue } from "./redaction.js";
import { detectAnomaly } from "./anomaly.js";

const preset = (name: string) => REDACTION_PRESETS.find((p) => p.name === name)!;

describe("redaction", () => {
  it("redacts emails, phones, cards and SSNs with presets", () => {
    const text = "Mail ada@example.com or call +1 (415) 555-0123. Card 4111 1111 1111 1111, SSN 123-45-6789.";
    const out = redactText(text, [preset("email"), preset("phone"), preset("credit_card"), preset("ssn")]);
    expect(out).toContain("[EMAIL]");
    expect(out).toContain("[PHONE]");
    expect(out).toContain("[CARD]");
    expect(out).toContain("[SSN]");
    expect(out).not.toContain("ada@example.com");
    expect(out).not.toContain("4111");
  });
  it("leaves ordinary numbers alone", () => {
    expect(redactText("Order 12345 shipped in 3 days", [preset("phone"), preset("credit_card"), preset("ssn")])).toBe("Order 12345 shipped in 3 days");
  });
  it("catches secret-looking tokens", () => {
    expect(redactText("key sk-abcdefghijklmnopqrstuvwxyz1234", [preset("api_key")])).toBe("key [SECRET]");
  });
  it("skips invalid patterns instead of throwing", () => {
    expect(redactText("hello", [{ name: "bad", pattern: "(", replacement: "x" }])).toBe("hello");
  });
  it("walks nested message structures", () => {
    const msgs = [{ role: "user", content: [{ type: "text", text: "I am bob@corp.io" }] }, { role: "assistant", content: "ok bob@corp.io" }];
    const out = redactValue(msgs, [preset("email")]);
    expect(JSON.stringify(out)).not.toContain("bob@corp.io");
    expect(out[0]!.role).toBe("user");
  });
});

describe("detectAnomaly", () => {
  it("needs a minimum history", () => {
    expect(detectAnomaly(100, [1, 2, 3]).anomalous).toBe(false);
  });
  it("flags a spike against a stable baseline", () => {
    const r = detectAnomaly(300, [100, 102, 98, 101, 99, 100, 103, 97]);
    expect(r.anomalous).toBe(true);
    expect(r.zScore).toBeGreaterThan(3);
  });
  it("does not flag a value inside the normal band", () => {
    expect(detectAnomaly(104, [100, 102, 98, 101, 99, 100, 103, 97]).anomalous).toBe(false);
  });
  it("respects direction so eval-score drops are anomalies but rises are not", () => {
    const hist = [0.9, 0.91, 0.89, 0.9, 0.92, 0.9];
    expect(detectAnomaly(0.6, hist, { direction: "down" }).anomalous).toBe(true);
    expect(detectAnomaly(0.99, hist, { direction: "down" }).anomalous).toBe(false);
  });
  it("floors the stddev so a flat history does not fire on tiny blips", () => {
    expect(detectAnomaly(101, [100, 100, 100, 100, 100, 100]).anomalous).toBe(false);
    expect(detectAnomaly(200, [100, 100, 100, 100, 100, 100]).anomalous).toBe(true);
  });
});
