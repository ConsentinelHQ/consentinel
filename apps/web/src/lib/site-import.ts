import "server-only";
import {
  PLANS,
  activePlan,
  countMonitoredSites,
  getOrgSitesByIds,
  isEntitled,
  setSiteSchedule,
  siteLimit,
  type BillingState,
  type Database,
} from "@consentinel/db";
import { stripe } from "@/lib/stripe";

export type ImportSchedule = "off" | "daily" | "weekly";

/** What the review step needs to price monitoring for the rows being imported. */
export interface PlanInfo {
  name: string | null;
  entitled: boolean;
  perSite: boolean;
  limit: number;
  used: number;
  /** Per-site subscription we can add seats to in place. */
  canAddSeats: boolean;
  /** USD per site per interval: the customer's real Stripe price when we have it. */
  unitPrice: number;
  interval: "month" | "year";
}

export async function describePlan(
  database: Database,
  orgId: string,
  billing: BillingState | null,
): Promise<PlanInfo> {
  const plan = activePlan(billing);
  const used = await countMonitoredSites(database, orgId);
  let unitPrice = PLANS.monitoring.price;
  let interval: PlanInfo["interval"] = "month";

  const itemId = billing?.stripeSubscriptionItemId ?? null;
  if (plan?.perSite && itemId) {
    // Annual and grandfathered customers pay their own rate. Quote that, not list.
    try {
      const item = await stripe().subscriptionItems.retrieve(itemId);
      if (item.price.unit_amount !== null) unitPrice = item.price.unit_amount / 100;
      if (item.price.recurring?.interval === "year") interval = "year";
    } catch {
      // List price is a fine fallback for a quote; the seat route uses Stripe's truth.
    }
  }

  return {
    name: plan?.name ?? null,
    entitled: isEntitled(billing),
    perSite: plan?.perSite ?? false,
    limit: siteLimit(billing),
    used,
    canAddSeats: (plan?.perSite ?? false) && itemId !== null,
    unitPrice,
    interval,
  };
}

/**
 * Turns monitoring on for sites in order until the plan's slots run out, and
 * returns the rest. Already-monitored sites keep their cadence and use no slot.
 */
export async function fillSchedules(
  database: Database,
  orgId: string,
  billing: BillingState | null,
  siteIds: readonly string[],
  schedule: Exclude<ImportSchedule, "off">,
): Promise<{ scheduled: string[]; overflow: string[] }> {
  const scheduled: string[] = [];
  const overflow: string[] = [];
  const candidates = (await getOrgSitesByIds(database, orgId, siteIds)).filter(
    (s) => s.schedule === "off",
  );
  if (!isEntitled(billing)) return { scheduled, overflow: candidates.map((s) => s.id) };

  let free = siteLimit(billing) - (await countMonitoredSites(database, orgId));
  for (const site of candidates) {
    if (free <= 0) {
      overflow.push(site.id);
      continue;
    }
    await setSiteSchedule(database, site.id, orgId, schedule);
    scheduled.push(site.id);
    free--;
  }
  return { scheduled, overflow };
}

/** The scanner's reasons are written for logs. These are written for customers. */
export function friendlyReason(reason: string): string {
  if (reason.includes("does not resolve")) return "Domain doesn't resolve";
  if (reason.includes("private or reserved")) return "Points at a private address";
  if (reason.includes("port")) return "Port isn't scannable";
  return "Can't be scanned";
}
