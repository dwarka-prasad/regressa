export function StatusBadge({ status }: { status: string }) {
  const cls = status === "success" ? "badge-ok" : status === "timeout" ? "badge-warn" : "badge-bad";
  return <span className={cls}><span className="dot bg-current" />{status}</span>;
}
export function PassBadge({ passed }: { passed: boolean | null }) {
  if (passed == null) return <span className="badge-muted">n/a</span>;
  return <span className={passed ? "badge-ok" : "badge-bad"}>{passed ? "pass" : "fail"}</span>;
}
export function ProviderBadge({ provider }: { provider: string }) {
  return <span className="badge-muted capitalize">{provider}</span>;
}
export function VersionBadge({ n, current = false }: { n: number; current?: boolean }) {
  return <span className={current ? "badge-brand" : "badge-muted"}>v{n}{current && " · current"}</span>;
}
