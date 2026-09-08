"use client";
import { motion, useReducedMotion } from "framer-motion";

export function Sparkline({ data, className = "h-8 w-24" }: { data: number[]; className?: string }) {
  const reduce = useReducedMotion();
  const w = 100, h = 32;
  const max = Math.max(...data, 1e-9), min = Math.min(...data, 0);
  const span = max - min || 1;
  const pts = data.map((v, i) => [(i / Math.max(1, data.length - 1)) * w, h - ((v - min) / span) * (h - 2) - 1] as const);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${d} L${w},${h} L0,${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={className} aria-hidden>
      <motion.path d={area} fill="currentColor" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 0.12 }} transition={{ duration: 0.8, delay: 0.3 }} />
      <motion.path d={d} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, ease: "easeOut" }} />
    </svg>
  );
}
