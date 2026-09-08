import OpenAI from "openai";
import { eq } from "drizzle-orm";
import { schema, type RegressaDb } from "@regressa/db";
import { SemanticSimilarityConfig, type EvalResultPayload } from "@regressa/shared-types";
import { config } from "../config.js";
import type { Evaluator, TraceForEval, EvalDefinitionRow } from "./types.js";

/**
 * Semantic similarity to a golden set: embed the trace output, compare (cosine) against every
 * golden example's expected_output for this eval definition; score = best match clamped to [0,1].
 * Golden embeddings are computed lazily and cached on the row.
 */
export class SemanticSimilarityEvaluator implements Evaluator {
  private client: OpenAI | null = null;
  constructor(private db: RegressaDb) {}

  async run(trace: TraceForEval, def: EvalDefinitionRow): Promise<EvalResultPayload> {
    const cfg = SemanticSimilarityConfig.parse(def.config);
    if (!config.openaiApiKey) throw new Error("OPENAI_API_KEY not set - cannot run semantic_similarity evals");
    this.client ??= new OpenAI({ apiKey: config.openaiApiKey });
    const model = cfg.embedding_model || config.embeddingModel;

    const golden = await this.db.select().from(schema.goldenExamples).where(eq(schema.goldenExamples.evalDefinitionId, def.id));
    if (golden.length === 0) return { score: 0, passed: false, reasoning: "No golden examples configured for this eval." };

    const missing = golden.filter((g) => !g.embedding || g.embedding.length === 0);
    if (missing.length) {
      const emb = await this.client.embeddings.create({ model, input: missing.map((g) => g.expectedOutput) });
      await Promise.all(missing.map((g, i) =>
        this.db.update(schema.goldenExamples).set({ embedding: emb.data[i]!.embedding }).where(eq(schema.goldenExamples.id, g.id))));
      missing.forEach((g, i) => { g.embedding = emb.data[i]!.embedding; });
    }

    const out = (trace.outputText ?? "").trim();
    if (!out) return { score: 0, passed: false, reasoning: "Empty output." };
    const emb = await this.client.embeddings.create({ model, input: out });
    const vec = emb.data[0]!.embedding;

    let best = -1, bestId = "";
    for (const g of golden) {
      const s = cosine(vec, g.embedding!);
      if (s > best) { best = s; bestId = g.id; }
    }
    const score = Math.max(0, Math.min(1, best));
    return {
      score,
      passed: score >= cfg.pass_threshold,
      reasoning: `Best cosine similarity ${best.toFixed(4)} to golden example ${bestId.slice(0, 8)} (${golden.length} examples).`,
      eval_cost_usd: ((emb.usage?.total_tokens ?? 0) * 0.02) / 1_000_000,
    };
  }
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { dot += a[i]! * b[i]!; na += a[i]! * a[i]!; nb += b[i]! * b[i]!; }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}
