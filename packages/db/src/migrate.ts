/**
 * Minimal forward-only SQL migration runner for Regressa.
 * Applies packages/db/migrations/*.sql in lexical order, tracked in regressa._migrations.
 */
import postgres from "postgres";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://regressa:regressa@localhost:5433/regressa_dev";

async function main() {
  const sql = postgres(DATABASE_URL, { max: 1, onnotice: () => {} });
  const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../migrations");

  await sql`CREATE SCHEMA IF NOT EXISTS regressa`;
  await sql`CREATE TABLE IF NOT EXISTS regressa._migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;

  const applied = new Set((await sql`SELECT name FROM regressa._migrations`).map((r) => r.name as string));
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const body = await readFile(path.join(dir, file), "utf8");
    process.stdout.write(`applying ${file} ... `);
    // Continuous aggregates can't be created inside a transaction block, and a multi-statement
    // simple query runs as one implicit transaction. So run one statement at a time (forward-only).
    for (const stmt of splitStatements(body)) await sql.unsafe(stmt);
    await sql`INSERT INTO regressa._migrations (name) VALUES (${file})`;
    console.log("ok");
  }
  console.log(`migrations up to date (${files.length} total)`);
  await sql.end();
}

/** Split on semicolons at end-of-line; strips comment-only chunks. No dollar-quoting in our migrations. */
export function splitStatements(body: string): string[] {
  return body
    .split(/;\s*(?:\r?\n|$)/)
    .map((s) => s.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n").trim())
    .filter((s) => s.length > 0);
}

const isMain = process.argv[1] && /migrate\.(ts|js)$/.test(process.argv[1]);
if (isMain) main().catch((err) => {
  console.error(err);
  process.exit(1);
});
