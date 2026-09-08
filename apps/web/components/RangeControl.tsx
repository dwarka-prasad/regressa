"use client";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { RANGES, type RangeKey } from "@/lib/range";

export function RangeControl({ value }: { value: string }) {
  const router = useRouter();
  const set = (r: RangeKey) => { document.cookie = `regressa_range=${r}; path=/; max-age=31536000; samesite=lax`; router.refresh(); };
  return (
    <div className="seg" role="tablist" aria-label="Time range">
      {(Object.keys(RANGES) as RangeKey[]).map((r) => (
        <button key={r} type="button" role="tab" aria-selected={value === r} className={`relative ${value === r ? "font-semibold text-brand" : ""}`} onClick={() => set(r)}>
          {value === r && <motion.span layoutId="range-active" className="absolute inset-0 rounded-md bg-brand-soft" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
          <span className="relative z-10">{RANGES[r].label}</span>
        </button>
      ))}
    </div>
  );
}
