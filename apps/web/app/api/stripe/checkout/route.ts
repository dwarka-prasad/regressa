import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getCtx } from "@/lib/current";
import { db, schema } from "@/lib/db";
import { PLAN_PRICES, stripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

/** GET /api/stripe/checkout?plan=pro -> redirects the org owner to Stripe Checkout. */
export async function GET(req: NextRequest) {
  const ctx = await getCtx();
  if (ctx.role !== "owner") return NextResponse.json({ error: "owner_only" }, { status: 403 });
  const plan = req.nextUrl.searchParams.get("plan") ?? "pro";
  const price = PLAN_PRICES[plan];
  if (!price) return NextResponse.json({ error: "billing_not_configured", hint: "Set STRIPE_SECRET_KEY and STRIPE_PRICE_PRO / STRIPE_PRICE_TEAM." }, { status: 501 });

  const s = stripe();
  let customerId = ctx.org.stripeCustomerId;
  if (!customerId) {
    const customer = await s.customers.create({ name: ctx.org.name, email: ctx.user.email, metadata: { regressa_org_id: ctx.org.id } });
    customerId = customer.id;
    await db().update(schema.orgs).set({ stripeCustomerId: customerId }).where(eq(schema.orgs.id, ctx.org.id));
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3100";
  const session = await s.checkout.sessions.create({
    mode: "subscription", customer: customerId, line_items: [{ price, quantity: 1 }],
    success_url: `${appUrl}/settings?billing=success`, cancel_url: `${appUrl}/settings?billing=cancelled`,
    metadata: { regressa_org_id: ctx.org.id, plan },
  });
  return NextResponse.redirect(session.url!, 303);
}
