import { describe, expect, it } from "vitest";
import { ago, fmtMs, fmtPct, fmtScore, fmtUsd } from "../format";
import { parseRange } from "../range";

describe("format helpers", () => {
  it("formats currency, latency, percent and scores with null fallbacks", () => {
    expect(fmtUsd(0.000234)).toBe("$0.0002");
    expect(fmtUsd(1.5, 2)).toBe("$1.50");
    expect(fmtUsd(null)).toBe("-");
    expect(fmtMs(455.6)).toBe("456ms");
    expect(fmtPct(0.1234)).toBe("12.3%");
    expect(fmtScore("0.8123")).toBe("0.812");
  });
  it("renders relative time", () => {
    expect(ago(new Date(Date.now() - 5_000))).toBe("5s ago");
    expect(ago(new Date(Date.now() - 3 * 60_000))).toBe("3m ago");
    expect(ago(new Date(Date.now() - 2 * 3600_000))).toBe("2h ago");
    expect(ago(new Date(Date.now() - 3 * 86400_000))).toBe("3d ago");
  });
  it("parses ranges with a safe default", () => {
    expect(parseRange("7d")).toBe("7d");
    expect(parseRange("nonsense")).toBe("24h");
    expect(parseRange(undefined)).toBe("24h");
  });
});
