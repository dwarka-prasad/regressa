import { Worker, type Job } from "bullmq";
import { and, eq } from "drizzle-orm";
import { schema, type RegressaDb } from "@regressa/db";
import { QUEUE_EVALS, type RunEvalJob } from "@regressa/shared-types";
import { connection } from "../queues.js";
import { config } from "../config.js";
import { LlmJudgeEvaluator } from "./llm-judge.js";
import { SemanticSimilarityEvaluator } from "./semantic-similarity.js";
import { CustomFunctionEvaluator } from "./custom-rules.js";
import type { Evaluator } from "./types.js";

export function startEvalWorker(db: RegressaDb) {
  const evaluators: Record<string, Evaluator> = {
    llm_judge: new LlmJudgeEvaluator(),
    semantic_similarity: new SemanticSimilarityEvaluator(db),
    custom_function: new CustomFunctionEvaluator(),
  };

  return new Worker<RunEvalJob>(QUEUE_EVALS, async (job: Job<RunEvalJob>) => {
    const { traceId, traceCreatedAt, evalDefinitionId, projectId } = job.data;
    const createdAt = new Date(traceCreatedAt);

    const [trace] = await db.select().from(schema.traces)
      .where(and(eq(schema.traces.id, traceId), eq(schema.traces.createdAt, createdAt))).limit(1);
    const [def] = await db.select().from(schema.evalDefinitions).where(eq(schema.evalDefinitions.id, evalDefinitionId)).limit(1);
    if (!trace || !def || !def.isActive) return { skipped: true };

    const evaluator = evaluators[def.type];
    if (!evaluator) throw new Error(`unknown eval type ${def.type}`);

    const result = await evaluator.run(trace, def);
    await db.insert(schema.evalResults).values({
      traceId, traceCreatedAt: createdAt, projectId, evalDefinitionId,
      score: result.score.toFixed(4), passed: result.passed, reasoning: result.reasoning,
      evalCostUsd: result.eval_cost_usd == null ? null : result.eval_cost_usd.toFixed(6),
    });
    return result;
  }, { connection, concurrency: config.concurrency.evals, limiter: { max: 60, duration: 60_000 } });
}
