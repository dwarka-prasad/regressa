import { IconArrowDown, IconArrowUp } from "./Icons";
import { Sparkline } from "./Sparkline";

export function pctDelta(cur: number, prev: number): number | null {
  if (!Number.isFinite(cur) || !Number.isFinite(prev) || prev === 0) return null;
  return ((cur - prev) / prev) * 100;
}

export function StatCard({ label, value, prev, current, lowerIsBetter = false, series, hint }: {
  label: string; value: string; current?: number; prev?: number; lowerIsBetter?: boolean; series?: number[]; hint?: string;
}) {
  const d = current != null && prev != null ? pctDelta(current, prev) : null;
  const good = d == null ? null : lowerIsBetter ? d <= 0 : d >= 0;
  return (
    <div className="card animate-fade-up">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="label">{label}</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
        </div>
        {series && series.length > 1 && <Sparkline data={series} className="mt-1 h-8 w-24 text-brand" />}
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-xs">
        {d == null ? <span className="text-muted">{hint ?? "vs previous period: n/a"}</span> : (
          <>
            <span className={`inline-flex items-center gap-0.5 font-medium ${good ? "text-ok" : "text-bad"}`}>
              {d >= 0 ? <IconArrowUp width={12} height={12} /> : <IconArrowDown width={12} height={12} />}{Math.abs(d).toFixed(1)}%
            </span>
            <span className="text-muted">vs previous period</span>
          </>
        )}
      </div>
    </div>
  );
}
