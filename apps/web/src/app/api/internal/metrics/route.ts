import { NextResponse } from "next/server";
import {
  PLANS,
  and,
  desc,
  eq,
  gt,
  inquiries,
  isEntitled,
  isPaidPlan,
  leads,
  orgMembers,
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
 * Test accounts are left out throughout (see isInternal).
 */
export async function GET(request: Request): Promise<NextResponse> {
  if (!internalAuthorized(request))
    return NextResponse.json({ error: "Not found." }, { status: 404 });

  const asked = Number(new URL(request.url).searchParams.get("hours") ?? "24");
  const hours = Number.isFinite(asked) ? Math.min(Math.max(asked, 1), 168) : 24;
  const since = new Date(Date.now() - hours * 3_600_000);
  const database = db();
  const count = sql<number>`count(*)::int`;

  // Our own domains plus METRICS_EXCLUDE_EMAILS, and every org those people belong to.
  const extra = (process.env["METRICS_EXCLUDE_EMAILS"] ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const isInternal = (email: string): boolean => {
    const e = email.toLowerCase();
    return /@(consentinelhq\.com|getconsentinel\.com)$/.test(e) || extra.includes(e);
  };

  const [userRows, memberRows, orgRows, siteRows, scanRows, failedRows, leadRows, inquiryRows] =
    await Promise.all([
      database.select({ id: users.id, email: users.email, createdAt: users.createdAt }).from(users),
      database.select({ orgId: orgMembers.orgId, userId: orgMembers.userId }).from(orgMembers),
      database
        .select({
          orgId: orgs.id,
          key: orgs.clerkOrgId,
          plan: orgs.plan,
          planStatus: orgs.planStatus,
          planQuantity: orgs.planQuantity,
        })
        .from(orgs),
      database
        .select({
          id: sites.id,
          orgId: sites.orgId,
          schedule: sites.schedule,
          archivedAt: sites.archivedAt,
        })
        .from(sites),
      database
        .select({ trigger: scans.trigger, status: scans.status, siteId: scans.siteId })
        .from(scans)
        .where(gt(scans.queuedAt, since)),
      database
        .select({
          url: scans.url,
          error: scans.error,
          blockedBy: scans.blockedBy,
          trigger: scans.trigger,
          siteId: scans.siteId,
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
        .limit(50),
      database
        .select({
          n: count,
          consented: sql<number>`count(*) filter (where ${leads.contactConsent})::int`,
        })
        .from(leads)
        .where(gt(leads.createdAt, since)),
      database.select({ n: count }).from(inquiries).where(gt(inquiries.createdAt, since)),
    ]);

  const internalUsers = new Set(userRows.filter((u) => isInternal(u.email)).map((u) => u.id));
  // Shopify dev stores we own (test charges) plus METRICS_EXCLUDE_SHOPS.
  const testShops = new Set(
    ["consentinel-test.myshopify.com"]
      .concat((process.env["METRICS_EXCLUDE_SHOPS"] ?? "").split(","))
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean)
      .map((d) => `shopify:${d}`),
  );
  const internalOrgs = new Set([
    ...memberRows.filter((m) => internalUsers.has(m.userId)).map((m) => m.orgId),
    ...orgRows.filter((o) => testShops.has(o.key)).map((o) => o.orgId),
  ]);
  const internalSites = new Set(siteRows.filter((s) => internalOrgs.has(s.orgId)).map((s) => s.id));
  const realScan = (siteId: string | null): boolean => !siteId || !internalSites.has(siteId);
  const realUsers = userRows.filter((u) => !internalUsers.has(u.id));

  let mrr = 0;
  let paying = 0;
  let pastDue = 0;
  const byPlan: Record<string, number> = {};
  for (const o of orgRows) {
    if (internalOrgs.has(o.orgId)) continue;
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
    if (!realScan(r.siteId)) continue;
    const t = (scansByTrigger[r.trigger] ??= { total: 0, failed: 0 });
    t.total += 1;
    if (r.status === "failed") t.failed += 1;
  }

  // Prospect reports are site-less scans; an open = a share link viewed by someone signed out.
  const [opens] = await database
    .select({ n: count })
    .from(scans)
    .where(and(sql`${scans.siteId} is null`, gt(scans.shareLastViewedAt, since)));

  return NextResponse.json({
    hours,
    reportOpens: opens?.n ?? 0,
    users: {
      total: realUsers.length,
      new: realUsers.filter((u) => u.createdAt > since).length,
    },
    revenue: { estMrr: mrr, paying, pastDue, byPlan },
    monitoredSites: siteRows.filter(
      (s) => !internalSites.has(s.id) && s.archivedAt === null && s.schedule !== "off",
    ).length,
    scans: scansByTrigger,
    failedCustomerScans: failedRows
      .filter((f) => realScan(f.siteId))
      .slice(0, 10)
      .map((f) => ({
        url: f.url,
        trigger: f.trigger,
        reason: f.blockedBy ? `blocked by ${f.blockedBy}` : (f.error ?? "failed").slice(0, 120),
      })),
    leads: { total: leadRows[0]?.n ?? 0, consented: leadRows[0]?.consented ?? 0 },
    inquiries: inquiryRows[0]?.n ?? 0,
    excluded: { users: internalUsers.size, orgs: internalOrgs.size },
  });
}
