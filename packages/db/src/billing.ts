import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { Database } from "./client.js";
import { orgs, scans, sites, type OrgPlan, type PlanStatus } from "./schema.js";

export interface BillingState {
  orgId: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripeSubscriptionItemId: string | null;
  plan: OrgPlan;
  planStatus: PlanStatus | null;
  planQuantity: number;
  currentPeriodEnd: Date | null;
}

/** Every status Stripe documents. Guards against their forward-compat string type. */
const KNOWN_STATUSES: readonly PlanStatus[] = [
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "incomplete",
  "incomplete_expired",
  "paused",
];

/** Unknown status returns null, which gates access. Log and check Stripe changelogs. */
export function toPlanStatus(value: string): PlanStatus | null {
  return KNOWN_STATUSES.find((s) => s === value) ?? null;
}

/** Statuses that actually grant access. Anything else is gated. */
const ENTITLED: ReadonlySet<string> = new Set(["active", "trialing"]);

export function isEntitled(state: BillingState | null): boolean {
  if (!state) return false;
  return state.plan === "monitoring" && ENTITLED.has(state.planStatus ?? "");
}

export async function getBillingState(db: Database, orgId: string): Promise<BillingState | null> {
  const [row] = await db
    .select({
      orgId: orgs.id,
      stripeCustomerId: orgs.stripeCustomerId,
      stripeSubscriptionId: orgs.stripeSubscriptionId,
      stripeSubscriptionItemId: orgs.stripeSubscriptionItemId,
      plan: orgs.plan,
      planStatus: orgs.planStatus,
      planQuantity: orgs.planQuantity,
      currentPeriodEnd: orgs.currentPeriodEnd,
    })
    .from(orgs)
    .where(eq(orgs.id, orgId))
    .limit(1);
  return row ?? null;
}

/** Persisted before checkout opens, so a retry never makes a second customer. */
export async function setStripeCustomerId(
  db: Database,
  orgId: string,
  customerId: string,
): Promise<void> {
  await db.update(orgs).set({ stripeCustomerId: customerId }).where(eq(orgs.id, orgId));
}

export async function countOrgSites(db: Database, orgId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(sites)
    .where(eq(sites.orgId, orgId));
  return row?.n ?? 0;
}

export interface SubscriptionPatch {
  stripeSubscriptionId: string | null;
  stripeSubscriptionItemId: string | null;
  plan: OrgPlan;
  planStatus: PlanStatus | null;
  planQuantity: number;
  currentPeriodEnd: Date | null;
}

/** Full overwrite, not a merge. Stripe is the source of truth for all of it. */
export async function applySubscriptionState(
  db: Database,
  orgId: string,
  patch: SubscriptionPatch,
): Promise<void> {
  await db.update(orgs).set(patch).where(eq(orgs.id, orgId));
}

export async function findOrgIdByStripeCustomerId(
  db: Database,
  customerId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ id: orgs.id })
    .from(orgs)
    .where(eq(orgs.stripeCustomerId, customerId))
    .limit(1);
  return row?.id ?? null;
}

// Share tokens live here rather than repository.ts: they exist to hand a full
// report to someone with no account, which is a commercial concern, not a scan one.

/** Mints a token on first call, returns the existing one after that. */
export async function getOrCreateShareToken(db: Database, scanId: string): Promise<string | null> {
  const [existing] = await db
    .select({ token: scans.shareToken })
    .from(scans)
    .where(eq(scans.id, scanId))
    .limit(1);
  if (!existing) return null;
  if (existing.token) return existing.token;

  // 32 bytes of base64url. Guessing one is not a realistic attack.
  const token = randomBytes(32).toString("base64url");
  await db.update(scans).set({ shareToken: token }).where(eq(scans.id, scanId));
  return token;
}

export async function revokeShareToken(db: Database, scanId: string): Promise<void> {
  await db.update(scans).set({ shareToken: null }).where(eq(scans.id, scanId));
}

/** True when the token matches this scan. Constant-time is unnecessary at 256 bits. */
export async function shareTokenMatches(
  db: Database,
  scanId: string,
  token: string,
): Promise<boolean> {
  const [row] = await db
    .select({ token: scans.shareToken })
    .from(scans)
    .where(eq(scans.id, scanId))
    .limit(1);
  return row?.token != null && row.token === token;
}
