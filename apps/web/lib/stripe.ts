import Stripe from "stripe";

export const PLAN_PRICES: Record<string, string | undefined> = {
  pro: process.env.STRIPE_PRICE_PRO,
  team: process.env.STRIPE_PRICE_TEAM,
};

let client: Stripe | null = null;
export function stripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY not configured");
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY);
  return client;
}
