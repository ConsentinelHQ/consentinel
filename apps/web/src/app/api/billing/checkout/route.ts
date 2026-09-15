import { NextResponse } from "next/server";
import { countOrgSites, getBillingState, setStripeCustomerId } from "@consentinel/db";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/server";
import { monitoringPriceId, stripe } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const session = await requireSession();
  const database = db();

  const state = await getBillingState(database, session.orgId);
  if (!state) return NextResponse.json({ error: "Org not found." }, { status: 404 });

  // Already paying. Send them to the portal instead of a second subscription.
  if (state.stripeSubscriptionId) {
    return NextResponse.json({ error: "Subscription already active." }, { status: 409 });
  }

  // One unit per site, minimum one so an empty org can still subscribe.
  const quantity = Math.max(1, await countOrgSites(database, session.orgId));

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
    line_items: [{ price: monitoringPriceId(), quantity }],
    // Both carried so the webhook can resolve the org from either object.
    client_reference_id: session.orgId,
    metadata: { orgId: session.orgId },
    subscription_data: { metadata: { orgId: session.orgId } },
    allow_promotion_codes: true,
    billing_address_collection: "auto",
    success_url: `${origin}/app/billing?checkout=success`,
    cancel_url: `${origin}/app/billing?checkout=cancelled`,
  });

  if (!checkout.url) {
    return NextResponse.json({ error: "Stripe returned no checkout URL." }, { status: 502 });
  }
  return NextResponse.json({ url: checkout.url });
}
