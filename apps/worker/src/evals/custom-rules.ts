import vm from "node:vm";
import { CustomFunctionConfig, type EvalResultPayload } from "@regressa/shared-types";
import type { Evaluator, TraceForEval, EvalDefinitionRow } from "./types.js";

/**
 * Custom scoring function: user-supplied JS evaluated in a locked-down vm context with a hard timeout.
 * `source` is a function body receiving `trace` = { input_messages, output_text, model, metadata }.
 * Must return { score: 0..1, passed?: boolean, reasoning?: string } or a bare number.
 *
 * Example source:  return { score: trace.output_text.length < 500 ? 1 : 0, reasoning: "length check" }
 */
export class CustomFunctionEvaluator implements Evaluator {
  async run(trace: TraceForEval, def: EvalDefinitionRow): Promise<EvalResultPayload> {
    const cfg = CustomFunctionConfig.parse(def.config);
    const sandbox = {
      trace: Object.freeze({
        input_messages: trace.inputMessages, output_text: trace.outputText ?? "", model: trace.model, metadata: trace.metadata ?? {},
      }),
      result: undefined as unknown,
    };
    const context = vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });
    const script = new vm.Script(`result = (function(trace){ ${cfg.source} \n})(trace);`, { filename: `eval-${def.id}.js` });
    script.runInContext(context, { timeout: 250 });

    const r = sandbox.result;
    let score: number, passed: boolean | undefined, reasoning: string | undefined;
    if (typeof r === "number") score = r;
    else if (r && typeof r === "object") {
      const o = r as { score?: unknown; passed?: unknown; reasoning?: unknown };
      score = Number(o.score);
      passed = typeof o.passed === "boolean" ? o.passed : undefined;
      reasoning = o.reasoning == null ? undefined : String(o.reasoning);
    } else throw new Error("custom eval must return a number or { score, passed?, reasoning? }");
    if (!Number.isFinite(score)) throw new Error("custom eval returned a non-numeric score");
    score = Math.max(0, Math.min(1, score));
    return { score, passed: passed ?? score >= cfg.pass_threshold, reasoning };
  }
}
