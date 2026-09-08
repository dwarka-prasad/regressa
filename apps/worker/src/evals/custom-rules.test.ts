import { describe, expect, it } from "vitest";
import { CustomFunctionEvaluator } from "./custom-rules.js";
import { cosine } from "./semantic-similarity.js";

const trace = { id: "t", createdAt: new Date(), projectId: "p", model: "m", inputMessages: [], outputText: "hello world", metadata: { tier: "gold" }, promptVersionId: null };
const def = (source: string, pass_threshold = 0.5) => ({ id: "d", type: "custom_function", projectId: "p", config: { source, pass_threshold } });

describe("CustomFunctionEvaluator", () => {
  it("returns object scores with reasoning", async () => {
    const r = await new CustomFunctionEvaluator().run(trace, def("return { score: trace.output_text.includes('hello') ? 1 : 0, reasoning: 'contains hello' }"));
    expect(r).toEqual({ score: 1, passed: true, reasoning: "contains hello" });
  });
  it("accepts bare numbers, clamps to [0,1], and applies the pass threshold", async () => {
    expect(await new CustomFunctionEvaluator().run(trace, def("return 0.4"))).toMatchObject({ score: 0.4, passed: false });
    expect(await new CustomFunctionEvaluator().run(trace, def("return 7"))).toMatchObject({ score: 1, passed: true });
    expect(await new CustomFunctionEvaluator().run(trace, def("return 0.4", 0.3))).toMatchObject({ passed: true });
  });
  it("exposes metadata and model to the function", async () => {
    const r = await new CustomFunctionEvaluator().run(trace, def("return trace.metadata.tier === 'gold' && trace.model === 'm' ? 1 : 0"));
    expect(r.score).toBe(1);
  });
  it("times out on infinite loops", async () => {
    await expect(new CustomFunctionEvaluator().run(trace, def("while(true){}"))).rejects.toThrow();
  });
  it("cannot reach process or require", async () => {
    await expect(new CustomFunctionEvaluator().run(trace, def("return process.exit(1)"))).rejects.toThrow();
    await expect(new CustomFunctionEvaluator().run(trace, def("return require('fs') ? 1 : 0"))).rejects.toThrow();
  });
  it("rejects non-numeric results", async () => {
    await expect(new CustomFunctionEvaluator().run(trace, def("return 'high'"))).rejects.toThrow(/number/);
    await expect(new CustomFunctionEvaluator().run(trace, def("return { score: 'x' }"))).rejects.toThrow(/non-numeric/);
  });
});

describe("cosine", () => {
  it("computes cosine similarity", () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosine([1, 0], [-1, 0])).toBeCloseTo(-1);
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });
});
