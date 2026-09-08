export const RANGES = {
  "24h": { label: "24h", hours: 24, bucket: "1 hour" },
  "7d": { label: "7d", hours: 24 * 7, bucket: "6 hours" },
  "30d": { label: "30d", hours: 24 * 30, bucket: "1 day" },
} as const;
export type RangeKey = keyof typeof RANGES;

export function parseRange(v: string | undefined | null): RangeKey {
  return v && v in RANGES ? (v as RangeKey) : "24h";
}

export function bucketLabel(iso: string, key: RangeKey): string {
  const d = new Date(iso);
  if (key === "24h") return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (key === "7d") return d.toLocaleString([], { weekday: "short", hour: "2-digit" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}
