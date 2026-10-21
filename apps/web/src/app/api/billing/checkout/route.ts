import { NextResponse } from "next/server";
import {
  ANNUAL_PRICES,
  PLANS,
  countOrgSites,
  getBillingState,
  isPaidPlan,
  setStripeCustomerId,
  type PaidPlan,
} from "@consentinel/db";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/server";
import { annualPriceIdFor, hasPrice, priceIdFor, stripe } from "@/lib/stripe";

export const runtime = "nodejs";

/** Plans open for purchase. Agency stays closed until workspaces ship. */
const SELLABLE: ReadonlySet<PaidPlan> = new Set(["monitoring", "growth"]);
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const session = await requireSession();
  const database = db();

  // No body or an unknown plan falls back to Monitor, which keeps old clients working.
  const body: unknown = await request.json().catch(() => null);
  const requested =
    typeof body === "object" && body !== null ? (body as { plan?: unknown }).plan : undefined;
  const plan: PaidPlan =
    typeof requested === "string" && isPaidPlan(requested) ? requested : "monitoring";
  const yearly =
    typeof body === "object" &&
    body !== null &&
    (body as { interval?: unknown }).interval === "year";
  if (yearly && !ANNUAL_PRICES[plan]) {
    return NextResponse.json(
      { error: "Yearly billing isn't available for this plan." },
      { status: 400 },
    );
  }

  if (!SELLABLE.has(plan) || !hasPrice(plan, yearly)) {
    return NextResponse.json(
      { error: `${PLANS[plan].name} isn't available to buy yet.` },
      { status: 400 },
    );
  }

  const state = await getBillingState(database, session.orgId);
  if (!state) return NextResponse.json({ error: "Org not found." }, { status: 404 });

  // Already paying. Send them to the portal instead of a second subscription.
  if (state.stripeSubscriptionId) {
    return NextResponse.json(
      { error: "You already have a plan. Change it from Manage billing." },
      { status: 409 },
    );
  }

  // Per-site plans bill one unit per site, minimum one. Flat plans are a single unit.
  // An import asks for exactly the sites it wants monitored, not every site on file.
  const requestedQty =
    typeof body === "object" && body !== null
      ? (body as { quantity?: unknown }).quantity
      : undefined;
  const quantity = PLANS[plan].perSite
    ? typeof requestedQty === "number" && Number.isInteger(requestedQty)
      ? Math.min(500, Math.max(1, requestedQty))
      : Math.max(1, await countOrgSites(database, session.orgId))
    : 1;
  const fromImport =
    typeof body === "object" &&
    body !== null &&
    (body as { returnTo?: unknown }).returnTo === "sites";

  let customerId = state.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe().customers.create({
      metadata: { orgId: session.orgId },
    });
    customerId = customer.id;
    await setStripeCustomerId(database, session.orgId, customerId);
  }

  const origin = new URL(request.url).origin;

  const checkout = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: yearly ? annualPriceIdFor(plan) : priceIdFor(plan), quantity }],
    // Both carried so the webhook can resolve the org from either object.
    client_reference_id: session.orgId,
    metadata: { orgId: session.orgId },
    subscription_data: { metadata: { orgId: session.orgId } },
    allow_promotion_codes: true,
    billing_address_collection: "auto",
    success_url: fromImport
      ? `${origin}/app/sites?checkout=success`
      : `${origin}/app/billing?checkout=success`,
    cancel_url: fromImport
      ? `${origin}/app/sites?checkout=cancelled`
      : `${origin}/app/billing?checkout=cancelled`,
  });

  if (!checkout.url) {
    return NextResponse.json({ error: "Stripe returned no checkout URL." }, { status: 502 });
  }
  return NextResponse.json({ url: checkout.url });
}
