import { describe, expect, it } from "vitest";
import { generateApiKey, hashApiKey, parseKeyMode } from "./keys.js";

describe("api keys", () => {
  it("generates rgsa_<mode>_ keys with a stable sha256 hash and a display prefix", () => {
    const k = generateApiKey("live");
    expect(k.plaintext).toMatch(/^rgsa_live_[A-Za-z0-9]{32}$/);
    expect(k.hash).toBe(hashApiKey(k.plaintext));
    expect(k.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(k.prefix).toBe(k.plaintext.slice(0, 15) + "...");
    expect(k.mode).toBe("live");
  });
  it("produces unique keys", () => {
    const seen = new Set(Array.from({ length: 50 }, () => generateApiKey("test").plaintext));
    expect(seen.size).toBe(50);
  });
  it("parses key mode from the prefix", () => {
    expect(parseKeyMode("rgsa_live_x")).toBe("live");
    expect(parseKeyMode("rgsa_test_x")).toBe("test");
    expect(parseKeyMode("sk-openai")).toBeNull();
  });
});
