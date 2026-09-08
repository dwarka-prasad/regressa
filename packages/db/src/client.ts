import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema.js";

export type RegressaDb = ReturnType<typeof createDb>["db"];

export function createDb(url = process.env.DATABASE_URL ?? "postgres://regressa:regressa@localhost:5433/regressa_dev", max = 10) {
  const sql = postgres(url, { max, onnotice: () => {} });
  const db = drizzle(sql, { schema });
  return { sql, db, close: () => sql.end() };
}
