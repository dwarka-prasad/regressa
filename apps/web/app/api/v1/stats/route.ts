import { NextResponse, type NextRequest } from "next/server";
import { apiAuth } from "@/lib/apiAuth";
import { totals } from "@/lib/queries";
import { parseRange, RANGES } from "@/lib/range";

export const dynamic = "force-dynamic";

/** GET /api/v1/stats?range=24h|7d|30d -> current and previous-period totals for the key's project. */
export async function GET(req: NextRequest) {
  const ctx = await apiAuth(req);
  if (ctx instanceof NextResponse) return ctx;
  const key = parseRange(req.nextUrl.searchParams.get("range"));
  const hours = RANGES[key].hours;
  const [current, previous] = await Promise.all([totals(ctx.projectId, hours), totals(ctx.projectId, hours, hours)]);
  return NextResponse.json({ range: key, current, previous });
}
