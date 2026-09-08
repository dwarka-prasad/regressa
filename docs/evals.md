# Evals

Eval definitions live per project and optionally scope to one prompt template. `sample_rate` controls the
fraction of matching traces that get scored.

| type | config | how it scores |
|---|---|---|
| `llm_judge` | `{ rubric, judge_model?, pass_threshold }` | Judge model (default `claude-sonnet-5`) scores 0-100 via a forced tool call; score/100 |
| `semantic_similarity` | `{ pass_threshold, embedding_model }` + golden examples | Best cosine similarity between output embedding and golden outputs |
| `custom_function` | `{ source, pass_threshold }` | JS function body run in `node:vm` with a 250ms timeout; receives `trace` |

Results land in `eval_results` with `score` (0-1), `passed`, `reasoning`, and the eval's own cost.
