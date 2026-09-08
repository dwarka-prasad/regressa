import { describe, expect, it } from "vitest";
import { diffLines, diffStats } from "../diff";

describe("diffLines", () => {
  it("marks unchanged, added and removed lines", () => {
    const ops = diffLines("a\nb\nc", "a\nB\nc\nd");
    expect(ops).toEqual([
      { type: "same", text: "a" },
      { type: "del", text: "b" },
      { type: "add", text: "B" },
      { type: "same", text: "c" },
      { type: "add", text: "d" },
    ]);
    expect(diffStats(ops)).toEqual({ added: 2, removed: 1 });
  });
  it("handles identical and empty inputs", () => {
    expect(diffLines("x", "x")).toEqual([{ type: "same", text: "x" }]);
    expect(diffLines("", "y")).toEqual([{ type: "del", text: "" }, { type: "add", text: "y" }]);
  });
});
