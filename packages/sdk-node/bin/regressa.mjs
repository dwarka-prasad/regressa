#!/usr/bin/env node
/**
 * Regressa CLI.
 *
 *   regressa gate --template <name> --run <id> [--app-url URL] [--wait 180] [--min-score 0.7]
 *                 [--max-drop-pct 10] [--max-error-rate 0.05] [--expect-evals 5] [--baseline-days 7]
 *
 * Polls GET /api/v1/gate until the verdict is pass or fail (or --wait seconds elapse) and exits 0 / 1.
 * Env: REGRESSA_API_KEY (required), REGRESSA_APP_URL (dashboard base URL, default https://app.regressa.dev).
 */
const args = process.argv.slice(2);
const cmd = args[0];

function opt(name, fallback) {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = args[i + 1];
  return v === undefined || v.startsWith("--") ? true : v;
}

if (cmd !== "gate") {
  console.log(`regressa <command>

  gate   Check a prompt template's CI run against its production baseline and exit non-zero on regression.

Run "regressa gate --help" for options.`);
  process.exit(cmd ? 1 : 0);
}
if (opt("help", false)) {
  console.log(`regressa gate --template <name> --run <id> [options]

  --app-url URL          Regressa dashboard URL (default $REGRESSA_APP_URL or https://app.regressa.dev)
  --wait SECONDS         How long to poll for pending evals (default 180)
  --baseline-days N      Baseline window in days (default 7)
  --min-score X          Fail if candidate avg eval score < X
  --max-drop-pct X       Fail if score drops more than X% vs baseline (default 10)
  --max-error-rate X     Fail if error rate > X (default 0.05)
  --max-latency-increase-pct X   (default 50)
  --max-cost-increase-pct X      (default 50)
  --expect-evals N       Wait for at least N eval results (default 1)
  --json                 Print the raw verdict as JSON`);
  process.exit(0);
}

const apiKey = process.env.REGRESSA_API_KEY;
if (!apiKey) { console.error("REGRESSA_API_KEY is not set"); process.exit(2); }
const template = opt("template");
const run = opt("run");
if (!template || template === true) { console.error("--template is required"); process.exit(2); }
if (!run || run === true) { console.error("--run is required (any unique id for this CI run, e.g. the commit SHA)"); process.exit(2); }

const appUrl = String(opt("app-url", process.env.REGRESSA_APP_URL ?? "https://app.regressa.dev")).replace(/\/$/, "");
const waitSeconds = Number(opt("wait", 180));
const params = new URLSearchParams({ template: String(template), run: String(run), baseline_days: String(opt("baseline-days", 7)) });
for (const [flag, key] of [["min-score", "min_score"], ["max-drop-pct", "max_drop_pct"], ["max-error-rate", "max_error_rate"], ["max-latency-increase-pct", "max_latency_increase_pct"], ["max-cost-increase-pct", "max_cost_increase_pct"], ["expect-evals", "expect_evals"]]) {
  const v = opt(flag);
  if (v !== undefined && v !== true) params.set(key, String(v));
}

const started = Date.now();
let attempt = 0;
for (;;) {
  attempt++;
  const res = await fetch(`${appUrl}/api/v1/gate?${params}`, { headers: { "X-Regressa-Project-Key": apiKey } });
  if (!res.ok) { console.error(`gate request failed: HTTP ${res.status} ${await res.text()}`); process.exit(2); }
  const verdict = await res.json();
  if (verdict.status !== "pending" || Date.now() - started > waitSeconds * 1000) {
    report(verdict);
    process.exit(verdict.status === "pass" ? 0 : 1);
  }
  if (attempt === 1 || attempt % 6 === 0) console.log(`waiting: ${verdict.pending_reason} (${Math.round((Date.now() - started) / 1000)}s)`);
  await new Promise((r) => setTimeout(r, 5000));
}

function report(v) {
  if (opt("json", false)) { console.log(JSON.stringify(v, null, 2)); return; }
  const icon = v.status === "pass" ? "PASS" : v.status === "fail" ? "FAIL" : "PENDING";
  console.log(`\nRegressa gate: ${icon}  template=${v.template} run=${v.run}`);
  console.log(`candidate v${v.candidate.version_number ?? "?"}: ${v.candidate.request_count} traces, ${v.candidate.eval_count} evals, score ${fmt(v.candidate.avg_eval_score)}`);
  console.log(`baseline  v${v.baseline.version_number ?? "?"}: ${v.baseline.request_count} traces, ${v.baseline.eval_count} evals, score ${fmt(v.baseline.avg_eval_score)}`);
  for (const c of v.checks) console.log(`  ${c.ok ? "ok  " : "FAIL"} ${c.name.padEnd(24)} ${c.detail}`);
  if (v.pending_reason) console.log(`  timed out while pending: ${v.pending_reason}`);
  console.log("");
}
function fmt(x) { return x == null ? "n/a" : Number(x).toFixed(3); }
