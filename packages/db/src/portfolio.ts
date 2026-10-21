import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Database } from "./client.js";
import { orgs, scans, sites } from "./schema.js";
import { can } from "./plans.js";
import type { BillingState } from "./billing.js";

/**
 * Agency views. One row per live site with its latest scan and the trend against
 * the completed scan before it, so a portfolio of 50 stores reads in one query.
 */
export interface PortfolioRow {
  id: string;
  url: string;
  label: string | null;
  client: string | null;
  schedule: string;
  lastScanId: string | null;
  lastStatus: string | null;
  lastFinishedAt: Date | null;
  lastBlockedBy: string | null;
  /** From the newest completed scan, so a scan in flight doesn't blank the numbers. */
  critical: number | null;
  warning: number | null;
  cmpName: string | null;
  completedScanId: string | null;
  /** Critical count on the completed scan before that one. Null when there's only one. */
  previousCritical: number | null;
}

interface RawRow extends Record<string, unknown> {
  id: string;
  url: string;
  label: string | null;
  client: string | null;
  schedule: string;
  last_scan_id: string | null;
  last_status: string | null;
  last_finished_at: Date | string | null;
  last_blocked_by: string | null;
  critical: number | null;
  warning: number | null;
  cmp_name: string | null;
  completed_scan_id: string | null;
  previous_critical: number | null;
}

function toDate(v: Date | string | null): Date | null {
  if (v === null) return null;
  return v instanceof Date ? v : new Date(v);
}

export async function listPortfolio(db: Database, orgId: string): Promise<PortfolioRow[]> {
  const rows = await db.execute<RawRow>(sql`
    select
      s.id, s.url, s.label, s.client, s.schedule,
      l.id as last_scan_id, l.status as last_status, l.finished_at as last_finished_at,
      l.blocked_by as last_blocked_by,
      c.id as completed_scan_id, c.critical_count as critical, c.warning_count as warning,
      c.cmp_name,
      p.critical_count as previous_critical
    from ${sites} s
    left join lateral (
      select id, status, finished_at, blocked_by from ${scans}
      where site_id = s.id order by queued_at desc limit 1
    ) l on true
    left join lateral (
      select id, critical_count, warning_count, cmp_name, finished_at from ${scans}
      where site_id = s.id and status = 'complete' order by finished_at desc nulls last limit 1
    ) c on true
    left join lateral (
      select critical_count from ${scans}
      where site_id = s.id and status = 'complete' and c.id is not null and id <> c.id
        and finished_at <= c.finished_at
      order by finished_at desc nulls last limit 1
    ) p on true
    where s.org_id = ${orgId} and s.archived_at is null
    order by coalesce(c.critical_count, -1) desc, s.created_at desc
  `);

  return Array.from(rows, (r) => ({
    id: r.id,
    url: r.url,
    label: r.label,
    client: r.client,
    schedule: r.schedule,
    lastScanId: r.last_scan_id,
    lastStatus: r.last_status,
    lastFinishedAt: toDate(r.last_finished_at),
    lastBlockedBy: r.last_blocked_by,
    critical: r.critical,
    warning: r.warning,
    cmpName: r.cmp_name,
    completedScanId: r.completed_scan_id,
    previousCritical: r.previous_critical,
  }));
}

/** Tags sites with a client. Org-scoped, so foreign ids are ignored, not errors. */
export async function setSitesClient(
  db: Database,
  orgId: string,
  siteIds: readonly string[],
  client: string | null,
): Promise<void> {
  if (siteIds.length === 0) return;
  await db
    .update(sites)
    .set({ client })
    .where(and(eq(sites.orgId, orgId), inArray(sites.id, [...siteIds])));
}

/** Live site ids, optionally for one client. Used by "rescan all". */
export async function listLiveSiteIds(
  db: Database,
  orgId: string,
  client?: string,
): Promise<{ id: string; url: string }[]> {
  return db
    .select({ id: sites.id, url: sites.url })
    .from(sites)
    .where(
      and(
        eq(sites.orgId, orgId),
        isNull(sites.archivedAt),
        ...(client !== undefined ? [eq(sites.client, client)] : []),
      ),
    );
}

export interface Branding {
  brandName: string | null;
  brandLogoUrl: string | null;
  brandColor: string | null;
  brandWebsite: string | null;
}

export async function getOrgBranding(db: Database, orgId: string): Promise<Branding | null> {
  const [row] = await db
    .select({
      brandName: orgs.brandName,
      brandLogoUrl: orgs.brandLogoUrl,
      brandColor: orgs.brandColor,
      brandWebsite: orgs.brandWebsite,
    })
    .from(orgs)
    .where(eq(orgs.id, orgId))
    .limit(1);
  return row ?? null;
}

export async function setOrgBranding(db: Database, orgId: string, brand: Branding): Promise<void> {
  await db.update(orgs).set(brand).where(eq(orgs.id, orgId));
}

/**
 * The brand a shared report should wear. Null unless the owning org is on a plan
 * with white-label and has actually set a name: a half-configured brand falls
 * back to Consentinel rather than rendering an empty header.
 */
export async function getReportBranding(
  db: Database,
  scanId: string,
): Promise<(Branding & { brandName: string }) | null> {
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
      brandName: orgs.brandName,
      brandLogoUrl: orgs.brandLogoUrl,
      brandColor: orgs.brandColor,
      brandWebsite: orgs.brandWebsite,
    })
    .from(scans)
    .innerJoin(sites, eq(sites.id, scans.siteId))
    .innerJoin(orgs, eq(orgs.id, sites.orgId))
    .where(eq(scans.id, scanId))
    .limit(1);
  if (!row?.brandName) return null;
  const billing: BillingState = row;
  if (!can(billing, "whiteLabel")) return null;
  return {
    brandName: row.brandName,
    brandLogoUrl: row.brandLogoUrl,
    brandColor: row.brandColor,
    brandWebsite: row.brandWebsite,
  };
}

export interface OrgSiteRef {
  id: string;
  url: string;
  schedule: string;
  archived: boolean;
}

/** Every site an org has, archived included, for matching an import against. */
export async function listOrgSiteRefs(db: Database, orgId: string): Promise<OrgSiteRef[]> {
  const rows = await db
    .select({
      id: sites.id,
      url: sites.url,
      schedule: sites.schedule,
      archivedAt: sites.archivedAt,
    })
    .from(sites)
    .where(eq(sites.orgId, orgId));
  return rows.map((r) => ({
    id: r.id,
    url: r.url,
    schedule: r.schedule,
    archived: r.archivedAt !== null,
  }));
}

/** The given sites that belong to this org, live only, in the order asked. */
export async function getOrgSitesByIds(
  db: Database,
  orgId: string,
  siteIds: readonly string[],
): Promise<{ id: string; schedule: string }[]> {
  if (siteIds.length === 0) return [];
  const rows = await db
    .select({ id: sites.id, schedule: sites.schedule })
    .from(sites)
    .where(and(eq(sites.orgId, orgId), inArray(sites.id, [...siteIds]), isNull(sites.archivedAt)));
  const byId = new Map(rows.map((r) => [r.id, r]));
  return siteIds.flatMap((id) => {
    const r = byId.get(id);
    return r ? [r] : [];
  });
}
