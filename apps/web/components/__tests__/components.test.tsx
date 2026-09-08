import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatCard, pctDelta } from "../StatCard";
import { Histogram } from "../Histogram";
import { PassBadge, StatusBadge, VersionBadge } from "../Badges";
import { Onboarding } from "../Onboarding";
import { TimeSeriesChart } from "../TimeSeriesChart";
import { Empty } from "../Empty";

describe("pctDelta", () => {
  it("returns percentage change and null for a zero or missing baseline", () => {
    expect(pctDelta(120, 100)).toBeCloseTo(20);
    expect(pctDelta(50, 100)).toBeCloseTo(-50);
    expect(pctDelta(1, 0)).toBeNull();
    expect(pctDelta(NaN, 1)).toBeNull();
  });
});

describe("StatCard", () => {
  it("shows a good delta when a lower value is better and it fell", () => {
    render(<StatCard label="p95" value="120ms" current={120} prev={200} lowerIsBetter />);
    expect(screen.getByText("40.0%").className).toContain("text-ok");
  });
  it("shows a bad delta when a metric that should rise fell", () => {
    render(<StatCard label="Score" value="0.7" current={0.7} prev={0.9} />);
    expect(screen.getByText("22.2%").className).toContain("text-bad");
  });
  it("falls back to a hint without a baseline", () => {
    render(<StatCard label="Evals" value="-" hint="no evals scored yet" />);
    expect(screen.getByText("no evals scored yet")).toBeTruthy();
  });
});

describe("badges", () => {
  it("map status and pass/fail to tones", () => {
    const { container } = render(<><StatusBadge status="success" /><StatusBadge status="timeout" /><StatusBadge status="error" /><PassBadge passed={null} /><PassBadge passed={false} /><VersionBadge n={3} current /></>);
    const cls = Array.from(container.querySelectorAll("span")).map((s) => s.className);
    expect(cls.some((c) => c.includes("badge-ok"))).toBe(true);
    expect(cls.some((c) => c.includes("badge-warn"))).toBe(true);
    expect(cls.filter((c) => c.includes("badge-bad")).length).toBe(2);
    expect(screen.getByText("n/a")).toBeTruthy();
    expect(screen.getByText(/v3/)).toBeTruthy();
  });
});

describe("Histogram", () => {
  it("renders ten buckets and marks those below the threshold", () => {
    const { container } = render(<Histogram scores={[0.1, 0.95, 0.95, 0.5]} threshold={0.7} />);
    const bars = container.querySelectorAll("div[title]");
    expect(bars).toHaveLength(10);
    expect(bars[0]!.className).toContain("bg-bad");
    expect(bars[9]!.className).toContain("bg-ok");
    expect(bars[9]!.getAttribute("title")).toContain(": 2");
  });
});

describe("Onboarding", () => {
  it("shows progress and hides when everything is done", () => {
    render(<Onboarding state={{ hasKey: true, hasTrace: true, hasTemplate: false, hasEval: false, hasAlert: false }} />);
    expect(screen.getByText("2 of 5 complete")).toBeTruthy();
    const { container } = render(<Onboarding state={{ hasKey: true, hasTrace: true, hasTemplate: true, hasEval: true, hasAlert: true }} />);
    expect(container.innerHTML).toBe("");
  });
});

describe("TimeSeriesChart", () => {
  it("renders an empty state and otherwise one path per series", () => {
    render(<TimeSeriesChart labels={[]} series={[]} />);
    expect(screen.getByText("No data in this range")).toBeTruthy();
    const { container } = render(<TimeSeriesChart labels={["a", "b", "c"]} series={[{ name: "x", color: "red", values: [1, 2, 3] }, { name: "y", color: "blue", values: [3, 2, 1] }]} />);
    expect(container.querySelectorAll("path[stroke]").length).toBe(2);
  });
});

describe("Empty", () => {
  it("renders title, body and action", () => {
    render(<Empty title="Nothing here" action={<button>Go</button>}>Body text</Empty>);
    expect(screen.getByText("Nothing here")).toBeTruthy();
    expect(screen.getByText("Body text")).toBeTruthy();
    expect(screen.getByRole("button")).toBeTruthy();
  });
});

describe("formatUnit", () => {
  it("formats by unit", async () => {
    const { formatUnit } = await import("../TimeSeriesChart");
    expect(formatUnit(1234)).toBe("1,234");
    expect(formatUnit(0.0005, "usd")).toBe("$0.0005");
    expect(formatUnit(12.5, "usd")).toBe("$12.50");
    expect(formatUnit(455.6, "ms")).toBe("456ms");
    expect(formatUnit(0.8123, "score")).toBe("0.81");
  });
});
