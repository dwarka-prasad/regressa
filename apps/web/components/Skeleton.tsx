export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-line/70 ${className}`} />;
}

export function PageSkeleton({ stats = 5, charts = 2 }: { stats?: number; charts?: number }) {
  return (
    <div className="space-y-5" aria-busy>
      <div><Skeleton className="h-7 w-48" /><Skeleton className="mt-2 h-4 w-72" /></div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {Array.from({ length: stats }).map((_, i) => <div key={i} className="card"><Skeleton className="h-3 w-20" /><Skeleton className="mt-3 h-7 w-24" /><Skeleton className="mt-3 h-3 w-28" /></div>)}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {Array.from({ length: charts }).map((_, i) => <div key={i} className={`card ${i === 0 ? "lg:col-span-2" : ""}`}><Skeleton className="h-4 w-32" /><Skeleton className="mt-4 h-40 w-full" /></div>)}
      </div>
    </div>
  );
}
