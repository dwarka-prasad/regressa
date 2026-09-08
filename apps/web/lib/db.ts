import { createDb, type RegressaDb } from "@regressa/db";

const g = globalThis as unknown as { __regressaDb?: ReturnType<typeof createDb> };
export function db(): RegressaDb {
  g.__regressaDb ??= createDb(process.env.DATABASE_URL, 5);
  return g.__regressaDb.db;
}
export { schema } from "@regressa/db";
