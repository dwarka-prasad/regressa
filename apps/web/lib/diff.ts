/** Minimal line-level diff (LCS) for comparing two prompt template versions. */
export type DiffOp = { type: "same" | "add" | "del"; text: string };

export function diffLines(a: string, b: string): DiffOp[] {
  const A = a.split("\n");
  const B = b.split("\n");
  const n = A.length, m = B.length;
  // LCS table (n+1 x m+1); templates are small so O(n*m) is fine.
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = A[i] === B[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const out: DiffOp[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { out.push({ type: "same", text: A[i]! }); i++; j++; }
    else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) { out.push({ type: "del", text: A[i]! }); i++; }
    else { out.push({ type: "add", text: B[j]! }); j++; }
  }
  while (i < n) out.push({ type: "del", text: A[i++]! });
  while (j < m) out.push({ type: "add", text: B[j++]! });
  return out;
}

export function diffStats(ops: DiffOp[]) {
  return { added: ops.filter((o) => o.type === "add").length, removed: ops.filter((o) => o.type === "del").length };
}
