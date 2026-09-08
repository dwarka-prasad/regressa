import Link from "next/link";
import { eq, sql } from "drizzle-orm";
import { getCtx } from "@/lib/current";
import { db, schema } from "@/lib/db";
import { getRange } from "@/lib/range.server";
import { evalScores, recentEvalResults } from "@/lib/queries";
import { createEval, deleteEval, toggleEval } from "./actions";
import { PageHeader } from "@/components/PageHeader";
import { Histogram } from "@/components/Histogram";
import { PassBadge } from "@/components/Badges";
import { ago, fmtPct, fmtScore } from "@/lib/format";

const TYPE_LABEL: Record<string, string> = { llm_judge: "LLM judge", semantic_similarity: "Golden set", custom_function: "Custom JS" };

export default async function EvalsPage({ searchParams }: { searchParams: { range?: string } }) {
  const { project } = await getCtx();
  const range = getRange(searchParams.range);
  const d = db();
  const [defs, templates, recent, scores] = await Promise.all([
    d.select({
      def: schema.evalDefinitions, templateName: schema.promptTemplates.name,
      runs: sql<number>`(SELECT count(*)::int FROM regressa.eval_results er WHERE er.eval_definition_id = ${schema.evalDefinitions.id} AND er.created_at >= now() - make_interval(hours => ${range.hours}))`,
      avg: sql<number | null>`(SELECT avg(score)::float8 FROM regressa.eval_results er WHERE er.eval_definition_id = ${schema.evalDefinitions.id} AND er.created_at >= now() - make_interval(hours => ${range.hours}))`,
      passRate: sql<number | null>`(SELECT avg(CASE WHEN passed THEN 1 ELSE 0 END)::float8 FROM regressa.eval_results er WHERE er.eval_definition_id = ${schema.evalDefinitions.id} AND er.created_at >= now() - make_interval(hours => ${range.hours}))`,
      cost: sql<number>`(SELECT coalesce(sum(eval_cost_usd), 0)::float8 FROM regressa.eval_results er WHERE er.eval_definition_id = ${schema.evalDefinitions.id} AND er.created_at >= now() - make_interval(hours => ${range.hours}))`,
    }).from(schema.evalDefinitions).leftJoin(schema.promptTemplates, eq(schema.promptTemplates.id, schema.evalDefinitions.promptTemplateId))
      .where(eq(schema.evalDefinitions.projectId, project.id)).orderBy(schema.evalDefinitions.createdAt),
    d.select().from(schema.promptTemplates).where(eq(schema.promptTemplates.projectId, project.id)).orderBy(schema.promptTemplates.name),
    recentEvalResults(project.id, range.hours, 25),
    evalScores(project.id, range.hours),
  ]);

  return (
    <div>
      <PageHeader title="Evals" description={`Automated quality scoring · last ${range.label}`} />
      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          {defs.length === 0 ? <div className="card text-sm text-muted">No eval definitions yet. Create one on the right to start scoring outputs automatically.</div> : (
            <div className="card overflow-x-auto p-0">
              <table className="data">
                <thead><tr><th>Eval</th><th>Scope</th><th className="text-right">Sample</th><th className="text-right">Runs</th><th className="text-right">Avg</th><th className="text-right">Pass</th><th className="text-right">Eval cost</th><th></th></tr></thead>
                <tbody>
                  {defs.map(({ def, templateName, runs, avg, passRate, cost }) => (
                    <tr key={def.id} className={def.isActive ? "" : "opacity-50"}>
                      <td><div className="font-medium">{def.name}</div><div className="text-xs text-muted">{TYPE_LABEL[def.type] ?? def.type}</div></td>
                      <td className="text-muted">{templateName ?? "All templates"}</td>
                      <td className="text-right tabular-nums">{fmtPct(def.sampleRate, 0)}</td>
                      <td className="text-right tabular-nums">{runs}</td>
                      <td className={`text-right tabular-nums ${avg != null && avg < 0.7 ? "text-bad" : ""}`}>{fmtScore(avg)}</td>
                      <td className="text-right tabular-nums">{fmtPct(passRate)}</td>
                      <td className="text-right tabular-nums text-muted">${Number(cost).toFixed(4)}</td>
                      <td className="whitespace-nowrap text-right">
                        <form action={toggleEval} className="inline"><input type="hidden" name="id" value={def.id} /><input type="hidden" name="active" value={String(!def.isActive)} /><button className="btn-ghost btn-sm">{def.isActive ? "Pause" : "Resume"}</button></form>
                        <form action={deleteEval} className="ml-1 inline"><input type="hidden" name="id" value={def.id} /><button className="btn-danger btn-sm">Delete</button></form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-3">
            <div className="card">
              <div className="mb-2 card-title">Score distribution</div>
              {scores.length === 0 ? <p className="text-sm text-muted">No scores yet.</p> : <Histogram scores={scores} threshold={0.7} />}
              <div className="mt-2 text-xs text-muted">{scores.length} results</div>
            </div>
            <div className="card md:col-span-2">
              <div className="mb-2 card-title">Recent results</div>
              {recent.length === 0 ? <p className="text-sm text-muted">Results will appear as traces are sampled. If you see none, check the worker has an LLM API key.</p> : (
                <ul className="max-h-80 divide-y divide-line/70 overflow-y-auto text-sm">
                  {recent.map(({ r, defName, model, output }) => (
                    <li key={r.id} className="py-2">
                      <div className="flex items-center gap-2"><span className="font-medium">{defName}</span><span className="mono text-muted">{model}</span><span className="ml-auto tabular-nums">{r.score}</span><PassBadge passed={r.passed} /><Link href={`/traces/${r.traceId}?at=${r.traceCreatedAt.toISOString()}`} className="link text-xs">trace</Link><span className="text-xs text-muted">{ago(r.createdAt)}</span></div>
                      <div className="mt-0.5 truncate text-xs text-muted">{r.reasoning || output}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
        <form action={createEval} className="card space-y-3 self-start">
          <div className="card-title">New eval</div>
          <div><label className="label">Name</label><input className="input" name="name" required placeholder="Helpfulness" /></div>
          <div><label className="label">Type</label>
            <select className="input" name="type" defaultValue="llm_judge">
              <option value="llm_judge">LLM-as-judge (rubric)</option>
              <option value="semantic_similarity">Semantic similarity to golden set</option>
              <option value="custom_function">Custom JS scoring function</option>
            </select></div>
          <div><label className="label">Scope</label>
            <select className="input" name="prompt_template_id" defaultValue=""><option value="">All templates</option>{templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="label">Sample rate</label><input className="input" name="sample_rate" type="number" step="0.05" min="0" max="1" defaultValue="0.25" /></div>
            <div><label className="label">Pass threshold</label><input className="input" name="pass_threshold" type="number" step="0.05" min="0" max="1" defaultValue="0.7" /></div>
          </div>
          <details className="rounded-lg border border-line p-3" open>
            <summary className="cursor-pointer text-xs font-semibold">LLM judge</summary>
            <div className="mt-2 space-y-2"><textarea className="input" name="rubric" rows={3} placeholder="Rate how helpful, accurate and on-topic the response is." /><input className="input" name="judge_model" placeholder="Judge model (default claude-sonnet-5)" /></div>
          </details>
          <details className="rounded-lg border border-line p-3">
            <summary className="cursor-pointer text-xs font-semibold">Golden set</summary>
            <textarea className="input mt-2 text-xs" name="golden" rows={3} placeholder="Expected outputs, separated by a line containing ---" />
          </details>
          <details className="rounded-lg border border-line p-3">
            <summary className="cursor-pointer text-xs font-semibold">Custom function</summary>
            <textarea className="input mt-2 text-xs" name="source" rows={3} placeholder="return { score: trace.output_text.length < 800 ? 1 : 0 }" />
          </details>
          <button className="btn-primary w-full" type="submit">Create eval</button>
        </form>
      </div>
    </div>
  );
}
