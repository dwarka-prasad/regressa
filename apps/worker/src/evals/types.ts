import type { EvalResultPayload } from "@regressa/shared-types";

export interface TraceForEval {
  id: string;
  createdAt: Date;
  projectId: string;
  model: string;
  inputMessages: unknown;
  outputText: string | null;
  metadata: unknown;
  promptVersionId: string | null;
}

export interface EvalDefinitionRow { id: string; type: string; config: unknown; projectId: string }

export interface Evaluator {
  run(trace: TraceForEval, def: EvalDefinitionRow): Promise<EvalResultPayload>;
}
