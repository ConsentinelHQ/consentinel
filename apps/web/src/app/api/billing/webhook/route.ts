import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { applySubscriptionState, findOrgIdByStripeCustomerId, toPlanStatus } from "@consentinel/db";
import { db } from "@/lib/server";
import { stripe } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Stripe retries on any non-2xx. So: unknown events return 200 and do nothing,
// and only genuine server faults return 500 to earn a retry.

function webhookSecret(): string {
  const secret = process.env["STRIPE_WEBHOOK_SECRET"];
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not set");
  return secret;
}

/** Org id from subscription metadata, falling back to the customer mapping. */
async function resolveOrgId(subscription: Stripe.Subscription): Promise<string | null> {
  const fromMetadata = subscription.metadata?.["orgId"];
  if (fromMetadata) return fromMetadata;
  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  return findOrgIdByStripeCustomerId(db(), customerId);
}

async function syncSubscription(subscription: Stripe.Subscription): Promise<void> {
  const orgId = await resolveOrgId(subscription);
  if (!orgId) throw new Error(`no org for subscription ${subscription.id}`);

  const item = subscription.items.data[0];
  const status = toPlanStatus(subscription.status);
  if (!status) console.error("[stripe webhook] unknown status", subscription.status);
  const gone = subscription.status === "canceled" || subscription.status === "incomplete_expired";
  const periodEnd = item?.current_period_end;

  await applySubscriptionState(db(), orgId, {
    stripeSubscriptionId: gone ? null : subscription.id,
    stripeSubscriptionItemId: gone ? null : (item?.id ?? null),
    // Plan drops to "none" the moment Stripe says the subscription is gone.
    plan: gone ? "none" : "monitoring",
    planStatus: status,
    planQuantity: gone ? 0 : (item?.quantity ?? 0),
    currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "no signature" }, { status: 400 });

  // Raw body required. Any parsing before this breaks verification.
  const raw = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(raw, signature, webhookSecret());
  } catch {
    // Bad signature is permanent. 400 so Stripe stops retrying.
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.mode !== "subscription" || !session.subscription) break;
        const id =
          typeof session.subscription === "string" ? session.subscription : session.subscription.id;
        // Refetched rather than trusted: the session payload has no item ids.
        await syncSubscription(await stripe().subscriptions.retrieve(id));
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        await syncSubscription(event.data.object);
        break;
      }
      default:
        break;
    }
  } catch (error) {
    console.error("[stripe webhook]", event.type, event.id, error);
    // 500 so Stripe retries. Losing this event loses someone's access.
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
