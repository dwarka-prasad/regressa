import { cookies } from "next/headers";
import { RANGES, parseRange, type RangeKey } from "./range";

/** Active dashboard time range: ?range= wins, then the cookie, then 24h. */
export function getRange(searchParam?: string): { key: RangeKey; hours: number; bucket: string; label: string } {
  const key = parseRange(searchParam ?? cookies().get("regressa_range")?.value);
  return { key, ...RANGES[key] };
}
