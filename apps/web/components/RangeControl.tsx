"use client";
import { useRouter } from "next/navigation";
import { RANGES, type RangeKey } from "@/lib/range";

export function RangeControl({ value }: { value: string }) {
  const router = useRouter();
  const set = (r: RangeKey) => { document.cookie = `regressa_range=${r}; path=/; max-age=31536000; samesite=lax`; router.refresh(); };
  return (
    <div className="seg" role="tablist" aria-label="Time range">
      {(Object.keys(RANGES) as RangeKey[]).map((r) => (
        <button key={r} type="button" role="tab" aria-selected={value === r} className={value === r ? "seg-on" : ""} onClick={() => set(r)}>{RANGES[r].label}</button>
      ))}
    </div>
  );
}
