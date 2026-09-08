"use client";
import { useId, useState } from "react";

export type Unit = "int" | "usd" | "ms" | "score";
export interface Series { name: string; color: string; values: number[]; unit?: Unit }

/** Formatting lives here (not in props) because server components cannot pass functions to client components. */
export function formatUnit(v: number, unit: Unit = "int"): string {
  switch (unit) {
    case "usd": return `$${v.toFixed(v < 0.01 && v > 0 ? 4 : 2)}`;
    case "ms": return `${Math.round(v)}ms`;
    case "score": return v.toFixed(2);
    default: return Number.isInteger(v) ? v.toLocaleString() : v.toFixed(1);
  }
}

/** Dependency-free responsive area/line chart with hover tooltip. `labels` align with each series' values. */
export function TimeSeriesChart({ labels, series, height = 160, kind = "area" }: { labels: string[]; series: Series[]; height?: number; kind?: "area" | "bar" }) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const n = labels.length;
  if (n === 0) return <div className="grid h-40 place-items-center text-sm text-muted">No data in this range</div>;
  const W = 600, H = height, padL = 36, padB = 20, padT = 8;
  const max = Math.max(1e-9, ...series.flatMap((s) => s.values));
  const x = (i: number) => padL + (n === 1 ? (W - padL) / 2 : (i / (n - 1)) * (W - padL - 4));
  const y = (v: number) => padT + (1 - v / max) * (H - padT - padB);
  const ticks = [0, 0.5, 1].map((t) => t * max);
  const fmt0 = (v: number) => formatUnit(v, series[0]?.unit);
  const bw = Math.max(2, ((W - padL) / n) * 0.7);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }} onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const px = ((e.clientX - r.left) / r.width) * W; let best = 0, bd = Infinity; for (let i = 0; i < n; i++) { const d = Math.abs(x(i) - px); if (d < bd) { bd = d; best = i; } } setHover(best); }}>
        {ticks.map((t) => <g key={t}><line x1={padL} x2={W} y1={y(t)} y2={y(t)} stroke="currentColor" className="text-line" strokeDasharray="2 4" /><text x={padL - 6} y={y(t) + 3} textAnchor="end" fontSize="9" className="fill-muted">{fmt0(t)}</text></g>)}
        {series.map((s, si) => {
          if (kind === "bar") return <g key={s.name}>{s.values.map((v, i) => <rect key={i} x={x(i) - bw / 2 + (si * bw) / series.length} width={bw / series.length} y={y(v)} height={Math.max(0, H - padB - y(v))} fill={s.color} rx={1.5} opacity={hover == null || hover === i ? 1 : 0.5} />)}</g>;
          const d = s.values.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ");
          return (
            <g key={s.name}>
              <defs><linearGradient id={`${id}-${si}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={s.color} stopOpacity="0.28" /><stop offset="100%" stopColor={s.color} stopOpacity="0" /></linearGradient></defs>
              {n > 1 && <path d={`${d} L${x(n - 1)},${H - padB} L${x(0)},${H - padB} Z`} fill={`url(#${id}-${si})`} />}
              <path d={d} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" />
              {hover != null && <circle cx={x(hover)} cy={y(s.values[hover] ?? 0)} r="3.5" fill={s.color} stroke="white" strokeWidth="1.5" />}
            </g>
          );
        })}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={padT} y2={H - padB} stroke="currentColor" className="text-muted/40" />}
        {[0, Math.floor((n - 1) / 2), n - 1].filter((v, i, a) => a.indexOf(v) === i).map((i) => <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} fontSize="9" className="fill-muted">{labels[i]}</text>)}
      </svg>
      {hover != null && (
        <div className="pointer-events-none absolute -top-1 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs shadow-pop" style={{ left: `${(x(hover) / W) * 100}%`, transform: `translateX(${hover > n / 2 ? "-105%" : "5%"})` }}>
          <div className="mb-0.5 font-medium">{labels[hover]}</div>
          {series.map((s) => <div key={s.name} className="flex items-center gap-1.5"><span className="dot" style={{ background: s.color }} /><span className="text-muted">{s.name}</span><span className="ml-auto pl-3 font-medium">{formatUnit(s.values[hover] ?? 0, s.unit ?? series[0]?.unit)}</span></div>)}
        </div>
      )}
    </div>
  );
}
