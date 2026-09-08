import Anthropic from "@anthropic-ai/sdk";
import { LlmJudgeConfig, estimateCostUsd, type EvalResultPayload } from "@regressa/shared-types";
import { config } from "../config.js";
import type { Evaluator, TraceForEval, EvalDefinitionRow } from "./types.js";

/**
 * LLM-as-judge: asks a judge model to score the response 0-100 against a rubric.
 * Uses Anthropic's Messages API with a forced tool call so the output is structured JSON.
 */
export class LlmJudgeEvaluator implements Evaluator {
  private client: Anthropic | null = null;

  async run(trace: TraceForEval, def: EvalDefinitionRow): Promise<EvalResultPayload> {
    const cfg = LlmJudgeConfig.parse(def.config);
    const model = cfg.judge_model ?? config.judgeModel;
    if (!config.anthropicApiKey) throw new Error("ANTHROPIC_API_KEY not set - cannot run llm_judge evals");
    this.client ??= new Anthropic({ apiKey: config.anthropicApiKey });

    const transcript = JSON.stringify(trace.inputMessages, null, 2).slice(0, 20_000);
    const output = (trace.outputText ?? "").slice(0, 20_000);

    const userContent = [
      "## Rubric", cfg.rubric, "",
      "## Conversation (input to the model under test)", transcript, "",
      "## Response under evaluation", output || "(empty response)",
    ].join("\n");

    const res = await this.client.messages.create({
      model,
      max_tokens: 512,
      system: "You are a strict, consistent evaluator of AI assistant responses. Score exactly per the rubric. Always call the submit_score tool.",
      tools: [{
        name: "submit_score",
        description: "Submit the evaluation score.",
        input_schema: {
          type: "object",
          properties: {
            score: { type: "integer", minimum: 0, maximum: 100, description: "0 = fails rubric completely, 100 = perfect" },
            reasoning: { type: "string", description: "One or two sentences justifying the score" },
          },
          required: ["score", "reasoning"],
        },
      }],
      tool_choice: { type: "tool", name: "submit_score" },
      messages: [{ role: "user", content: userContent }],
    });

    const tool = res.content.find((b) => b.type === "tool_use");
    const input = (tool && tool.type === "tool_use" ? tool.input : {}) as { score?: number; reasoning?: string };
    const score = Math.max(0, Math.min(1, (Number(input.score) || 0) / 100));
    return {
      score,
      passed: score >= cfg.pass_threshold,
      reasoning: input.reasoning ?? "",
      eval_cost_usd: estimateCostUsd(model, res.usage.input_tokens, res.usage.output_tokens) ?? undefined,
    };
  }
}
