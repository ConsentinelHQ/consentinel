import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import {
  activePlan,
  countMonitoredSites,
  getBillingState,
  getOrgSitesByIds,
  isEntitled,
  setPlanQuantity,
  siteLimit,
} from "@consentinel/db";
import { requireSession } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/server";
import { fillSchedules } from "@/lib/site-import";
import { stripe } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const body = z.object({
  siteIds: z.array(z.string().uuid()).min(1).max(200),
  schedule: z.enum(["daily", "weekly"]),
});

/**
 * Adds Monitor seats for exactly the sites the customer just chose, charges the
 * prorated amount now, then turns those sites on. Per-site plans only: flat
 * plans change tier through the portal.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const session = await requireSession();
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });

  const limit = await rateLimit(`seats:${session.orgId}`, 5, 600);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Give it a few minutes and try again." }, { status: 429 });
  }

  const database = db();
  const billing = await getBillingState(database, session.orgId);
  const plan = activePlan(billing);
  const itemId = billing?.stripeSubscriptionItemId ?? null;
  if (!billing || !isEntitled(billing) || !plan?.perSite || !itemId) {
    return NextResponse.json(
      { error: "Adding sites here needs an active Monitor plan." },
      { status: 409 },
    );
  }

  const wanted = (await getOrgSitesByIds(database, session.orgId, parsed.data.siteIds)).filter(
    (s) => s.schedule === "off",
  );
  const free = siteLimit(billing) - (await countMonitoredSites(database, session.orgId));
  const needed = Math.max(0, wanted.length - free);

  if (needed > 0) {
    const quantity = billing.planQuantity + needed;
    // Same sites, same seat count: a double click or retry can't charge twice.
    const key = createHash("sha256")
      .update(`${session.orgId}:${String(quantity)}:${wanted.map((s) => s.id).join(",")}`)
      .digest("hex");
    try {
      await stripe().subscriptionItems.update(
        itemId,
        {
          quantity,
          // Bill the prorated difference now. A failed card refuses the change,
          // so nobody gets slots they didn't pay for.
          proration_behavior: "always_invoice",
          payment_behavior: "error_if_incomplete",
        },
        { idempotencyKey: `seats:${key}` },
      );
    } catch (error) {
      Sentry.captureException(error, { tags: { area: "billing", op: "add-seats" } });
      return NextResponse.json(
        { error: "Your card was declined or Stripe refused the change. Update it in Billing." },
        { status: 402 },
      );
    }
    await setPlanQuantity(database, session.orgId, quantity);
  }

  const fresh = await getBillingState(database, session.orgId);
  const { scheduled, overflow } = await fillSchedules(
    database,
    session.orgId,
    fresh,
    wanted.map((s) => s.id),
    parsed.data.schedule,
  );
  return NextResponse.json({
    added: needed,
    scheduled: scheduled.length,
    overLimit: overflow.length,
  });
}
