/** Score distribution: 10 buckets across [0,1]. */
export function Histogram({ scores, threshold }: { scores: number[]; threshold?: number }) {
  const buckets = Array.from({ length: 10 }, () => 0);
  for (const s of scores) buckets[Math.min(9, Math.max(0, Math.floor(s * 10)))]!++;
  const max = Math.max(1, ...buckets);
  return (
    <div>
      <div className="flex h-24 items-end gap-1">
        {buckets.map((b, i) => {
          const lo = i / 10;
          const below = threshold != null && lo + 0.1 <= threshold;
          return <div key={i} title={`${lo.toFixed(1)}–${(lo + 0.1).toFixed(1)}: ${b}`} className={`flex-1 rounded-t ${below ? "bg-bad/60" : "bg-ok/70"}`} style={{ height: `${(b / max) * 100}%`, minHeight: b ? 3 : 0 }} />;
        })}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted"><span>0.0</span><span>0.5</span><span>1.0</span></div>
    </div>
  );
}
