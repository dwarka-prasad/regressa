import Link from "next/link";
import { eq, sql } from "drizzle-orm";
import { getCtx } from "@/lib/current";
import { db, schema } from "@/lib/db";
import { PageHeader } from "@/components/PageHeader";
import { Empty } from "@/components/Empty";
import { VersionBadge } from "@/components/Badges";
import { ago, fmtScore } from "@/lib/format";

export default async function PromptsPage() {
  const { project } = await getCtx();
  const rows = await db().select({
    tpl: schema.promptTemplates,
    versions: sql<number>`(SELECT count(*)::int FROM regressa.prompt_versions pv WHERE pv.prompt_template_id = prompt_templates.id)`,
    latestAt: sql<string | null>`(SELECT max(pv.first_seen_at) FROM regressa.prompt_versions pv WHERE pv.prompt_template_id = prompt_templates.id)`,
    latestVersion: sql<number | null>`(SELECT max(pv.version_number) FROM regressa.prompt_versions pv WHERE pv.prompt_template_id = prompt_templates.id)`,
    requests7d: sql<number>`(SELECT count(*)::int FROM regressa.traces t JOIN regressa.prompt_versions pv ON pv.id = t.prompt_version_id WHERE pv.prompt_template_id = prompt_templates.id AND t.created_at >= now() - interval '7 days')`,
    score7d: sql<number | null>`(SELECT avg(er.score)::float8 FROM regressa.eval_results er JOIN regressa.traces t ON t.id = er.trace_id AND t.created_at = er.trace_created_at JOIN regressa.prompt_versions pv ON pv.id = t.prompt_version_id WHERE pv.prompt_template_id = prompt_templates.id AND er.created_at >= now() - interval '7 days')`,
  }).from(schema.promptTemplates).where(eq(schema.promptTemplates.projectId, project.id)).orderBy(schema.promptTemplates.name);

  return (
    <div>
      <PageHeader title="Prompt templates" description="Each distinct template hash becomes a version. Compare quality, cost and latency across versions." />
      {rows.length === 0 ? (
        <Empty title="No templates tracked yet">Pass <code>promptTemplate: {"{ name, raw }"}</code> in the SDK call and Regressa will version the template automatically.</Empty>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map(({ tpl, versions, latestAt, latestVersion, requests7d, score7d }) => (
            <Link key={tpl.id} href={`/prompts/${tpl.id}`} className="card group transition hover:border-brand/40 hover:shadow-pop">
              <div className="flex items-start justify-between gap-2">
                <div className="truncate font-semibold group-hover:text-brand">{tpl.name}</div>
                {latestVersion != null && <VersionBadge n={latestVersion} current />}
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                <div><div className="label">Versions</div><div className="font-medium tabular-nums">{versions}</div></div>
                <div><div className="label">Requests 7d</div><div className="font-medium tabular-nums">{requests7d}</div></div>
                <div><div className="label">Score 7d</div><div className={`font-medium tabular-nums ${score7d != null && score7d < 0.7 ? "text-bad" : ""}`}>{fmtScore(score7d)}</div></div>
              </div>
              <div className="mt-3 text-xs text-muted">Last change {latestAt ? ago(latestAt) : "-"}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
