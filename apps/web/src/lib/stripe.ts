import Stripe from "stripe";

let client: Stripe | undefined;

/** Lazy so a missing key fails on the billing routes, not at module load. */
export function stripe(): Stripe {
  if (!client) {
    const key = process.env["STRIPE_SECRET_KEY"];
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
    client = new Stripe(key);
  }
  return client;
}

export function monitoringPriceId(): string {
  const price = process.env["STRIPE_PRICE_MONITORING"];
  if (!price?.startsWith("price_")) {
    throw new Error("STRIPE_PRICE_MONITORING must be a price id");
  }
  return price;
}
