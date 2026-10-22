import { NextResponse } from "next/server";
import {
  PLANS,
  and,
  desc,
  eq,
  gt,
  inquiries,
  isEntitled,
  isNull,
  isPaidPlan,
  leads,
  orgs,
  scans,
  sites,
  sql,
  users,
} from "@consentinel/db";
import { internalAuthorized } from "@/lib/internal-auth";
import { db } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Morning brief numbers. Read-only aggregates over the last `hours` (default 24,
 * max 168). Revenue is an estimate at list price: annual plans count as monthly.
 */
export async function GET(request: Request): Promise<NextResponse> {
  if (!internalAuthorized(request))
    return NextResponse.json({ error: "Not found." }, { status: 404 });

  const asked = Number(new URL(request.url).searchParams.get("hours") ?? "24");
  const hours = Number.isFinite(asked) ? Math.min(Math.max(asked, 1), 168) : 24;
  const since = new Date(Date.now() - hours * 3_600_000);
  const database = db();
  const count = sql<number>`count(*)::int`;

  const [
    [userTotals],
    [newUsers],
    orgRows,
    scanRows,
    failed,
    [leadCounts],
    [inquiryCount],
    [monitored],
  ] = await Promise.all([
    database.select({ n: count }).from(users),
    database.select({ n: count }).from(users).where(gt(users.createdAt, since)),
    database
      .select({
        orgId: orgs.id,
        name: orgs.name,
        plan: orgs.plan,
        planStatus: orgs.planStatus,
        planQuantity: orgs.planQuantity,
        createdAt: orgs.createdAt,
      })
      .from(orgs),
    database
      .select({ trigger: scans.trigger, status: scans.status, n: count })
      .from(scans)
      .where(gt(scans.queuedAt, since))
      .groupBy(scans.trigger, scans.status),
    database
      .select({
        url: scans.url,
        error: scans.error,
        blockedBy: scans.blockedBy,
        trigger: scans.trigger,
      })
      .from(scans)
      .where(
        and(
          gt(scans.queuedAt, since),
          eq(scans.status, "failed"),
          sql`${scans.siteId} is not null`,
        ),
      )
      .orderBy(desc(scans.queuedAt))
      .limit(10),
    database
      .select({
        n: count,
        consented: sql<number>`count(*) filter (where ${leads.contactConsent})::int`,
      })
      .from(leads)
      .where(gt(leads.createdAt, since)),
    database.select({ n: count }).from(inquiries).where(gt(inquiries.createdAt, since)),
    database
      .select({ n: count })
      .from(sites)
      .where(and(isNull(sites.archivedAt), sql`${sites.schedule} <> 'off'`)),
  ]);

  let mrr = 0;
  let paying = 0;
  let pastDue = 0;
  const byPlan: Record<string, number> = {};
  for (const o of orgRows) {
    if (o.planStatus === "past_due" || o.planStatus === "unpaid") pastDue++;
    const entitled = isEntitled({
      orgId: o.orgId,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      stripeSubscriptionItemId: null,
      plan: o.plan,
      planStatus: o.planStatus,
      planQuantity: o.planQuantity,
      currentPeriodEnd: null,
    });
    if (!entitled || !isPaidPlan(o.plan)) continue;
    const spec = PLANS[o.plan];
    paying++;
    byPlan[spec.name] = (byPlan[spec.name] ?? 0) + 1;
    mrr += spec.perSite ? spec.price * Math.max(o.planQuantity, 1) : spec.price;
  }

  const scansByTrigger: Record<string, { total: number; failed: number }> = {};
  for (const r of scanRows) {
    const t = (scansByTrigger[r.trigger] ??= { total: 0, failed: 0 });
    t.total += r.n;
    if (r.status === "failed") t.failed += r.n;
  }

  return NextResponse.json({
    hours,
    users: { total: userTotals?.n ?? 0, new: newUsers?.n ?? 0 },
    revenue: { estMrr: mrr, paying, pastDue, byPlan },
    monitoredSites: monitored?.n ?? 0,
    scans: scansByTrigger,
    failedCustomerScans: failed.map((f) => ({
      url: f.url,
      trigger: f.trigger,
      reason: f.blockedBy ? `blocked by ${f.blockedBy}` : (f.error ?? "failed").slice(0, 120),
    })),
    leads: { total: leadCounts?.n ?? 0, consented: leadCounts?.consented ?? 0 },
    inquiries: inquiryCount?.n ?? 0,
  });
}
