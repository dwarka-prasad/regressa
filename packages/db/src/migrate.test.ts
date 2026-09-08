import { describe, expect, it } from "vitest";
import { splitStatements } from "./migrate.js";

describe("splitStatements", () => {
  it("splits on end-of-line semicolons and drops comment-only lines", () => {
    const sql = [
      "-- header comment",
      "CREATE TABLE a (",
      "  id INT, -- inline comment kept with the statement",
      "  name TEXT",
      ");",
      "",
      "SELECT create_hypertable('a', 'created_at');",
      "-- trailing comment",
    ].join("\n");
    const stmts = splitStatements(sql);
    expect(stmts).toHaveLength(2);
    expect(stmts[0]).toContain("CREATE TABLE a (");
    expect(stmts[0]).not.toContain("header comment");
    expect(stmts[1]).toBe("SELECT create_hypertable('a', 'created_at')");
  });
  it("does not split on semicolons inside a line", () => {
    expect(splitStatements("SELECT 'a;b';\nSELECT 2;")).toEqual(["SELECT 'a;b'", "SELECT 2"]);
  });
});
