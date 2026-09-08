"use client";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Sparkline } from "./Sparkline";
import { AnimatedNumber, HoverCard } from "./motion";

export function pctDelta(cur: number, prev: number): number | null {
  if (!Number.isFinite(cur) || !Number.isFinite(prev) || prev === 0) return null;
  return ((cur - prev) / prev) * 100;
}

export type StatFormat = "int" | "usd" | "ms" | "pct" | "score";
const formatters: Record<StatFormat, (v: number) => string> = {
  int: (v) => Math.round(v).toLocaleString(),
  usd: (v) => `$${v.toFixed(2)}`,
  ms: (v) => `${Math.round(v)}ms`,
  pct: (v) => `${(v * 100).toFixed(1)}%`,
  score: (v) => v.toFixed(3),
};

export function StatCard({ label, value, numeric, format = "int", prev, current, lowerIsBetter = false, series, hint }: {
  label: string; value: string; numeric?: number | null; format?: StatFormat; current?: number; prev?: number; lowerIsBetter?: boolean; series?: number[]; hint?: string;
}) {
  const d = current != null && prev != null ? pctDelta(current, prev) : null;
  const good = d == null ? null : lowerIsBetter ? d <= 0 : d >= 0;
  return (
    <HoverCard className="card relative overflow-hidden">
      <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-brand/5 blur-2xl" />
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="label">{label}</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight">
            {numeric != null && Number.isFinite(numeric) ? <AnimatedNumber value={numeric} format={formatters[format]} /> : value}
          </div>
        </div>
        {series && series.length > 1 && <Sparkline data={series} className="mt-1 h-8 w-24 text-brand" />}
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-xs">
        {d == null ? <span className="text-muted">{hint ?? "vs previous period: n/a"}</span> : (
          <>
            <span className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-medium ${good ? "bg-ok/10 text-ok" : "bg-bad/10 text-bad"}`}>
              {d >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}{Math.abs(d).toFixed(1)}%
            </span>
            <span className="text-muted">vs previous period</span>
          </>
        )}
      </div>
    </HoverCard>
  );
}
