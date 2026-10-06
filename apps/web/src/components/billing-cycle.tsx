import { stripe } from "@/lib/stripe";

const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/** Billing cadence read live from Stripe, so annual subscribers see what they actually pay. */
export async function BillingCycle({
  subscriptionId,
  perSite,
}: {
  subscriptionId: string;
  perSite: boolean;
}) {
  let label: string | null = null;
  try {
    const sub = await stripe().subscriptions.retrieve(subscriptionId);
    const price = sub.items.data[0]?.price;
    const interval = price?.recurring?.interval;
    if (price?.unit_amount != null && (interval === "month" || interval === "year")) {
      const amount = MONEY.format(price.unit_amount / 100);
      label = `${interval === "year" ? "Annually" : "Monthly"}, ${amount}${perSite ? " per site" : ""}`;
    }
  } catch {
    // Stripe unreachable: leave the row out rather than break the page.
  }
  if (!label) return null;
  return (
    <div>
      <dt>Billing</dt>
      <dd>{label}</dd>
    </div>
  );
}
