import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { db, schema } from "@/lib/db";
import { stripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

/** POST /api/stripe/webhook - keeps orgs.plan in sync with the Stripe subscription. */
export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = req.headers.get("stripe-signature");
  if (!secret || !sig) return NextResponse.json({ error: "webhook_not_configured" }, { status: 501 });
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(await req.text(), sig, secret);
  } catch (err) {
    return NextResponse.json({ error: `invalid_signature: ${String(err)}` }, { status: 400 });
  }

  const d = db();
  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object as Stripe.Checkout.Session;
      const orgId = s.metadata?.regressa_org_id;
      if (orgId) await d.update(schema.orgs).set({ plan: s.metadata?.plan ?? "pro", stripeSubscriptionId: typeof s.subscription === "string" ? s.subscription : null }).where(eq(schema.orgs.id, orgId));
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
      await d.update(schema.orgs).set({ plan: "free", stripeSubscriptionId: null }).where(eq(schema.orgs.stripeCustomerId, customerId));
      break;
    }
    default:
      break;
  }
  return NextResponse.json({ received: true });
}
