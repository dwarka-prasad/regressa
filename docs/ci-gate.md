# CI regression gate

Block a merge when a prompt change lowers quality, raises errors, or blows up latency or cost.

## How it works

1. In CI, run your prompt against a fixed set of inputs through the Regressa SDK, tagging every call with the run id:

   ```ts
   const regressa = new Regressa({ defaultMetadata: { regressa_run: process.env.GITHUB_SHA } });
   const openai = wrapOpenAI(new OpenAI(), regressa);
   for (const input of goldenInputs) {
     await openai.chat.completions.create({
       model: "gpt-4o-mini",
       messages: [{ role: "system", content: SUPPORT_PROMPT }, { role: "user", content: input }],
       regressa: { promptTemplate: { name: "support-agent", raw: SUPPORT_PROMPT } },
     });
   }
   await regressa.shutdown();
   ```

   Regressa detects the new template hash as a new version and scores the traces with your active evals.

2. Ask Regressa for a verdict. The CLI polls until evals are scored:

   ```bash
   REGRESSA_API_KEY=rgsa_live_... npx @regressa/node gate --template support-agent --run $GITHUB_SHA --max-drop-pct 10 --expect-evals 20
   ```

   Exit code 0 = pass, 1 = fail or timed out pending, 2 = configuration error.

## GitHub Action

```yaml
- name: Run prompt eval set
  run: node scripts/run-eval-set.mjs
  env:
    REGRESSA_API_KEY: ${{ secrets.REGRESSA_API_KEY }}
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}

- name: Regressa gate
  uses: dwarka-prasad/regressa/.github/actions/regressa-gate@main
  with:
    api-key: ${{ secrets.REGRESSA_API_KEY }}
    template: support-agent
    expect-evals: "20"
    max-drop-pct: "10"
    min-score: "0.7"
```

## API

`GET /api/v1/gate?template=&run=&baseline_days=7&min_score=&max_drop_pct=10&max_error_rate=0.05&max_latency_increase_pct=50&max_cost_increase_pct=50&expect_evals=1`

Response: `{ status: "pass" | "fail" | "pending", checks: [{ name, ok, detail }], candidate, baseline }`.

Candidate = traces for the template tagged with `metadata.regressa_run = run`. Baseline = the template's other
traffic over `baseline_days`. Gate runs are never dropped by budget sampling.
