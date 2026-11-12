import { and, eq, ne } from "drizzle-orm";
import type { Database } from "./client.js";
import { PLANS } from "./plans.js";
import { orgs, sites, type PlanStatus } from "./schema.js";

/**
 * A Shopify store maps to one org keyed "shopify:<shop>.myshopify.com" in
 * clerk_org_id. No Clerk user, no Stripe customer: Shopify owns identity and
 * billing for these orgs, so no migration and no second billing path in Stripe code.
 */

export interface ShopifyOrg {
  orgId: string;
  plan: string;
  planStatus: PlanStatus | null;
  siteId: string | null;
  siteUrl: string | null;
  /** Install time, near enough: the org is created on first load. */
  createdAt: Date;
}

export async function findShopifyOrg(db: Database, key: string): Promise<ShopifyOrg | null> {
  const [org] = await db
    .select({
      id: orgs.id,
      plan: orgs.plan,
      planStatus: orgs.planStatus,
      createdAt: orgs.createdAt,
    })
    .from(orgs)
    .where(eq(orgs.clerkOrgId, key))
    .limit(1);
  if (!org) return null;
  // One store, one site. Oldest wins if a merchant ever added more by hand.
  const [site] = await db
    .select({ id: sites.id, url: sites.url })
    .from(sites)
    .where(eq(sites.orgId, org.id))
    .orderBy(sites.createdAt)
    .limit(1);
  return {
    orgId: org.id,
    plan: org.plan,
    planStatus: org.planStatus,
    siteId: site?.id ?? null,
    siteUrl: site?.url ?? null,
    createdAt: org.createdAt,
  };
}

/** Idempotent: a reinstall or a race between two first loads lands on one org. */
export async function createShopifyOrg(db: Database, key: string, name: string): Promise<string> {
  const [row] = await db
    .insert(orgs)
    .values({ clerkOrgId: key, name })
    .onConflictDoNothing({ target: orgs.clerkOrgId })
    .returning({ id: orgs.id });
  if (row) return row.id;
  const [existing] = await db
    .select({ id: orgs.id })
    .from(orgs)
    .where(eq(orgs.clerkOrgId, key))
    .limit(1);
  if (!existing) throw new Error("failed to create shopify org");
  return existing.id;
}

/**
 * Mirrors the Shopify charge onto the org. Active turns on scans at the plan's
 * cadence (Starter weekly, Monitor daily); anything else drops the plan, and the
 * scheduler stops on its own.
 */
export async function applyShopifyPlan(
  db: Database,
  orgId: string,
  state: {
    status: PlanStatus;
    currentPeriodEnd: Date | null;
    /** Which Shopify plan is active. Defaults to Monitor for charges made before Starter. */
    plan?: "starter" | "monitoring";
  },
): Promise<void> {
  const active = state.status === "active";
  const plan = state.plan ?? "monitoring";
  const schedule = PLANS[plan].schedule;
  await db
    .update(orgs)
    .set({
      plan: active ? plan : "none",
      planStatus: state.status,
      planQuantity: active ? 1 : 0,
      currentPeriodEnd: state.currentPeriodEnd,
    })
    .where(eq(orgs.id, orgId));
  if (active) {
    // Set the cadence on every switch, so a Starter-to-Monitor upgrade goes daily
    // and a downgrade goes weekly. Pausing lives in pausedAt, so it survives this.
    await db
      .update(sites)
      .set({ schedule })
      .where(and(eq(sites.orgId, orgId), ne(sites.schedule, schedule)));
  }
}

/** shop/redact: Shopify's 48-hour post-uninstall erase. Cascades to sites and scans. */
export async function deleteShopifyOrg(db: Database, key: string): Promise<void> {
  await db.delete(orgs).where(eq(orgs.clerkOrgId, key));
}
