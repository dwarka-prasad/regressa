export const fmtUsd = (v: number | string | null | undefined, digits = 4) => v == null ? "-" : `$${Number(v).toFixed(digits)}`;
export const fmtInt = (v: number | string | null | undefined) => v == null ? "-" : Number(v).toLocaleString();
export const fmtMs = (v: number | string | null | undefined) => v == null ? "-" : `${Math.round(Number(v))}ms`;
export const fmtPct = (v: number | string | null | undefined, digits = 1) => v == null ? "-" : `${(Number(v) * 100).toFixed(digits)}%`;
export const fmtScore = (v: number | string | null | undefined) => v == null ? "-" : Number(v).toFixed(3);
export const fmtTime = (d: Date | string | null | undefined) => d == null ? "-" : new Date(d).toLocaleString();
export const ago = (d: Date | string) => {
  const s = Math.max(0, (Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};
