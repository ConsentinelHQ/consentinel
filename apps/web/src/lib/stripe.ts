import type { PaidPlan } from "@consentinel/db";
import Stripe from "stripe";

let client: Stripe | undefined;

/** Lazy so a missing key fails on the billing routes, not at module load. */
export function stripe(): Stripe {
  if (!client) {
    const key = process.env["STRIPE_SECRET_KEY"];
    if (!key) throw new Error("STRIPE_SECRET_KEY isn’t set");
    client = new Stripe(key);
  }
  return client;
}

const PRICE_ENV: Record<PaidPlan, string> = {
  monitoring: "STRIPE_PRICE_MONITORING",
  growth: "STRIPE_PRICE_GROWTH",
  agency: "STRIPE_PRICE_AGENCY",
};

export function priceIdFor(plan: PaidPlan): string {
  const name = PRICE_ENV[plan];
  const price = process.env[name];
  if (!price?.startsWith("price_")) throw new Error(`${name} must be a price id`);
  return price;
}

/** Plan for a Stripe price, or null if it isn't one of ours. */
export function planForPrice(priceId: string | undefined): PaidPlan | null {
  if (!priceId) return null;
  for (const plan of Object.keys(PRICE_ENV) as PaidPlan[]) {
    if (process.env[PRICE_ENV[plan]] === priceId) return plan;
  }
  return null;
}
