import { and, desc, eq, gte, inArray, isNotNull, isNull, lt, ne, sql } from "drizzle-orm";
import type { ScanResult, Severity } from "@consentinel/shared";
import type { Database } from "./client.js";
import {
  findings,
  orgMembers,
  orgs,
  scans,
  sites,
  users,
  type ScanRow,
  type ScanSchedule,
  type ScanTrigger,
} from "./schema.js";
import { fingerprintFinding } from "./fingerprint.js";

export interface CreateScanInput {
  url: string;
  siteId?: string;
  trigger?: ScanTrigger;
}

/** Enqueue a scan. Returns the row the worker will pick up and the UI will poll. */
export async function createScan(db: Database, input: CreateScanInput): Promise<ScanRow> {
  const [row] = await db
    .insert(scans)
    .values({
      url: input.url,
      ...(input.siteId !== undefined ? { siteId: input.siteId } : {}),
      trigger: input.trigger ?? "public",
      status: "queued",
    })
    .returning();
  if (!row) throw new Error("failed to create scan");
  return row;
}

export async function markScanRunning(db: Database, scanId: string): Promise<void> {
  await db
    .update(scans)
    .set({ status: "running", startedAt: new Date() })
    .where(eq(scans.id, scanId));
}

export async function markScanFailed(db: Database, scanId: string, error: string): Promise<void> {
  await db
    .update(scans)
    .set({ status: "failed", error, finishedAt: new Date() })
    .where(eq(scans.id, scanId));
}

/** A WAF refused us. Recorded distinctly so the report can say who, and what to do. */
export async function markScanBlocked(
  db: Database,
  scanId: string,
  vendor: string,
  message: string,
): Promise<void> {
  await db
    .update(scans)
    .set({ status: "failed", error: message, blockedBy: vendor, finishedAt: new Date() })
    .where(eq(scans.id, scanId));
}

/**
 * Persist a completed scan: denormalized summary, immutable result blob, and one
 * row per finding. Single transaction - a scan is either fully stored or not at
 * all. A half-written scan would corrupt every future diff against it.
 */
export async function completeScan(
  db: Database,
  scanId: string,
  result: ScanResult,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(scans)
      .set({
        status: "complete",
        finishedAt: new Date(),
        engineVersion: result.engineVersion,
        signatureLibraryVersion: result.signatureLibraryVersion,
        cmpRegistryVersion: result.cmpRegistryVersion,
        cmpId: result.cmp.detected?.id ?? null,
        cmpName: result.cmp.detected?.name ?? null,
        consentModePresent: result.cmp.consentMode.present,
        headline: result.headline,
        criticalCount: result.counts.critical,
        warningCount: result.counts.warning,
        infoCount: result.counts.info,
        result,
      })
      .where(eq(scans.id, scanId));

    if (result.findings.length === 0) return;

    await tx.insert(findings).values(
      result.findings.map((f) => ({
        scanId,
        localId: f.id,
        schemaVersion: f.schemaVersion,
        type: f.type,
        severity: f.severity,
        vendor: f.vendor,
        category: f.category,
        title: f.title,
        detail: f.detail,
        observedUnder: f.observedUnder,
        evidence: f.evidence,
        ...(f.consentSignal !== undefined ? { consentSignal: f.consentSignal } : {}),
        compliance: f.compliance,
        remediation: f.remediation,
        fingerprint: fingerprintFinding(f),
        firstSeenAt: new Date(f.firstSeenAt),
      })),
    );
  });
}

export async function getScan(db: Database, scanId: string): Promise<ScanRow | undefined> {
  const [row] = await db.select().from(scans).where(eq(scans.id, scanId)).limit(1);
  return row;
}

/** Scan history for a site, newest first. */
export async function listScansForSite(
  db: Database,
  siteId: string,
  limit = 50,
): Promise<ScanRow[]> {
  return (
    db
      .select()
      .from(scans)
      .where(eq(scans.siteId, siteId))
      // Queue time exists on every scan; finish time is null until done, which sorted
      // every unfinished scan to the top in arbitrary order.
      .orderBy(desc(scans.queuedAt))
      .limit(limit)
  );
}

/**
 * Recent completed anonymous scan for a URL. Backs the free-tier cache so the
 * same domain is not re-scanned on every visit - scanning is the cost center,
 * and protecting it is what lets the free tier stay free (Epic 2.4).
 */
export async function findCachedScan(
  db: Database,
  url: string,
  maxAgeMs: number,
): Promise<ScanRow | undefined> {
  const cutoff = new Date(Date.now() - maxAgeMs);
  const [row] = await db
    .select()
    .from(scans)
    .where(
      and(
        eq(scans.url, url),
        eq(scans.status, "complete"),
        isNull(scans.siteId),
        gte(scans.finishedAt, cutoff),
      ),
    )
    .orderBy(desc(scans.finishedAt))
    .limit(1);
  return row;
}

/** Scans started from one IP-equivalent key in a window. Backs rate limiting. */
export async function countRecentScansForUrl(
  db: Database,
  url: string,
  windowMs: number,
): Promise<number> {
  const cutoff = new Date(Date.now() - windowMs);
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(scans)
    .where(and(eq(scans.url, url), gte(scans.queuedAt, cutoff)));
  return row?.n ?? 0;
}

export interface DiffItem {
  fingerprint: string;
  vendor: string;
  title: string;
  severity: Severity;
  remediation: string;
}

export interface ScanDiff {
  added: DiffItem[];
  fixed: DiffItem[];
  unchanged: number;
}

/**
 * Diff two scans by fingerprint. This is the foundation for regression alerting:
 * "added" with a critical severity is exactly the publish-time alert (Epic 4.2).
 */
export async function diffScans(
  db: Database,
  /** One scan, or several: findings in ANY base count as already known. */
  baseScanIds: string | string[],
  headScanId: string,
): Promise<ScanDiff> {
  const bases = Array.isArray(baseScanIds) ? baseScanIds : [baseScanIds];
  const rows = await db
    .select({
      scanId: findings.scanId,
      fingerprint: findings.fingerprint,
      vendor: findings.vendor,
      title: findings.title,
      severity: findings.severity,
      remediation: findings.remediation,
    })
    .from(findings)
    .where(inArray(findings.scanId, [...bases, headScanId]));

  const base = new Map<string, (typeof rows)[number]>();
  const head = new Map<string, (typeof rows)[number]>();
  for (const r of rows) (r.scanId === headScanId ? head : base).set(r.fingerprint, r);

  const added = [...head.values()].filter((r) => !base.has(r.fingerprint)).map(toItem);
  const fixed = [...base.values()].filter((r) => !head.has(r.fingerprint)).map(toItem);
  const unchanged = [...head.keys()].filter((f) => base.has(f)).length;

  return { added, fixed, unchanged };
}

export async function upsertUser(
  db: Database,
  clerkUserId: string,
  email: string,
): Promise<string> {
  const [row] = await db
    .insert(users)
    .values({ clerkUserId, email })
    .onConflictDoUpdate({ target: users.clerkUserId, set: { email } })
    .returning({ id: users.id });
  if (!row) throw new Error("failed to upsert user");
  return row.id;
}

export async function addSite(
  db: Database,
  orgId: string,
  url: string,
  label?: string,
): Promise<string> {
  const [row] = await db
    .insert(sites)
    .values({ orgId, url, ...(label !== undefined ? { label } : {}) })
    .onConflictDoNothing({ target: [sites.orgId, sites.url] })
    .returning({ id: sites.id });
  if (row) return row.id;
  const [existing] = await db
    .select({ id: sites.id, archivedAt: sites.archivedAt })
    .from(sites)
    .where(and(eq(sites.orgId, orgId), eq(sites.url, url)))
    .limit(1);
  if (!existing) throw new Error("failed to add site");
  // Re-adding an archived site restores it, history and baseline included.
  if (existing.archivedAt !== null) {
    await db.update(sites).set({ archivedAt: null }).where(eq(sites.id, existing.id));
  }
  return existing.id;
}

export interface SiteSummary {
  id: string;
  url: string;
  label: string | null;
  schedule: string;
  lastScanAt: Date | null;
  lastCritical: number | null;
  lastStatus: string | null;
  lastBlockedBy: string | null;
}

/**
 * Sites for an org with their most recent scan rolled in. One query rather than
 * N+1: the dashboard lists every site and each needs its latest result.
 */
export async function listSitesForOrg(db: Database, orgId: string): Promise<SiteSummary[]> {
  const rows = await db
    .select({
      id: sites.id,
      url: sites.url,
      label: sites.label,
      schedule: sites.schedule,
      lastScanAt: scans.finishedAt,
      lastCritical: scans.criticalCount,
      lastStatus: scans.status,
      lastBlockedBy: scans.blockedBy,
    })
    .from(sites)
    .leftJoin(
      scans,
      and(
        eq(scans.siteId, sites.id),
        // Only the newest scan per site.
        sql`${scans.startedAt} = (select max(started_at) from scans s2 where s2.site_id = ${sites.id})`,
      ),
    )
    .where(and(eq(sites.orgId, orgId), isNull(sites.archivedAt)))
    .orderBy(desc(sites.createdAt));

  return rows.map((r) => ({
    ...r,
    schedule: r.schedule,
    lastScanAt: r.lastScanAt,
    lastCritical: r.lastCritical,
    lastStatus: r.lastStatus,
  }));
}

/**
 * Fetch a site only if it belongs to the given org. Scoping the read this way
 * means an authorization bug cannot leak another org's data through a guessed
 * UUID - the query simply returns nothing.
 */
export async function getSiteForOrg(
  db: Database,
  siteId: string,
  orgId: string,
): Promise<typeof sites.$inferSelect | undefined> {
  const [row] = await db
    .select()
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.orgId, orgId)))
    .limit(1);
  return row;
}

export async function setSiteSchedule(
  db: Database,
  siteId: string,
  orgId: string,
  schedule: ScanSchedule,
): Promise<void> {
  await db
    .update(sites)
    .set({ schedule })
    .where(and(eq(sites.id, siteId), eq(sites.orgId, orgId)));
}

const SCHEDULE_INTERVAL_MS: Record<string, number> = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

export interface DueSite {
  id: string;
  url: string;
  orgId: string;
  schedule: string;
}

/**
 * Sites whose next scheduled scan is due.
 *
 * Driven by lastScheduledAt rather than a cron expression per site: the tick can
 * run at any cadence, miss a beat, or be replayed, and each site still gets
 * scanned about once per interval. A fixed cron would silently skip a site if the
 * worker happened to be down at the wrong minute.
 *
 * Only orgs on a paid plan are returned - scheduling is what the subscription buys.
 */
export async function listDueSites(db: Database, now = new Date()): Promise<DueSite[]> {
  const rows = await db
    .select({
      id: sites.id,
      url: sites.url,
      orgId: sites.orgId,
      schedule: sites.schedule,
      lastScheduledAt: sites.lastScheduledAt,
    })
    .from(sites)
    .innerJoin(orgs, eq(orgs.id, sites.orgId))
    .where(and(ne(sites.schedule, "off"), eq(orgs.plan, "monitoring"), isNull(sites.archivedAt)));

  return rows
    .filter((r) => {
      const interval = SCHEDULE_INTERVAL_MS[r.schedule];
      if (interval === undefined) return false;
      if (!r.lastScheduledAt) return true; // never run, so it is due now
      return now.getTime() - r.lastScheduledAt.getTime() >= interval;
    })
    .map((r) => ({ id: r.id, url: r.url, orgId: r.orgId, schedule: r.schedule }));
}

/** Claim a site so a concurrent tick does not double-enqueue it. */
export async function markSiteScheduled(db: Database, siteId: string): Promise<void> {
  await db.update(sites).set({ lastScheduledAt: new Date() }).where(eq(sites.id, siteId));
}

/** The scan immediately before this one for the same site. Null on first scan. */
export async function findPreviousScan(
  db: Database,
  siteId: string,
  beforeScanId: string,
): Promise<ScanRow | undefined> {
  const [current] = await db
    .select({ finishedAt: scans.finishedAt })
    .from(scans)
    .where(eq(scans.id, beforeScanId))
    .limit(1);
  if (!current?.finishedAt) return undefined;

  const [prev] = await db
    .select()
    .from(scans)
    .where(
      and(
        eq(scans.siteId, siteId),
        eq(scans.status, "complete"),
        lt(scans.finishedAt, current.finishedAt),
      ),
    )
    .orderBy(desc(scans.finishedAt))
    .limit(1);
  return prev;
}

export interface AlertRecipient {
  email: string;
  orgId: string;
}

/** Everyone in the org that owns this site. Members who turned alerts off are skipped. */
export async function listAlertRecipients(db: Database, siteId: string): Promise<AlertRecipient[]> {
  return db
    .select({ email: users.email, orgId: orgs.id })
    .from(sites)
    .innerJoin(orgs, eq(orgs.id, sites.orgId))
    .innerJoin(orgMembers, eq(orgMembers.orgId, orgs.id))
    .innerJoin(users, eq(users.id, orgMembers.userId))
    .where(and(eq(sites.id, siteId), eq(orgMembers.alertsEnabled, true)));
}

/** The site's allowlist token for a scan, or null for ad-hoc scans with no site. */
export async function getScanTokenForScan(db: Database, scanId: string): Promise<string | null> {
  const rows = await db
    .select({ token: sites.scanToken })
    .from(scans)
    .innerJoin(sites, eq(sites.id, scans.siteId))
    .where(eq(scans.id, scanId))
    .limit(1);
  return rows[0]?.token ?? null;
}

/** Soft delete or restore. Scans, reports, and share links are never touched. */
export async function setSiteArchived(
  db: Database,
  siteId: string,
  orgId: string,
  archived: boolean,
): Promise<void> {
  await db
    .update(sites)
    .set(archived ? { archivedAt: new Date() } : { archivedAt: null, schedule: "off" })
    .where(and(eq(sites.id, siteId), eq(sites.orgId, orgId)));
}

export interface ArchivedSite {
  id: string;
  url: string;
  label: string | null;
  archivedAt: Date | null;
}

/** Archived sites for an org, newest archive first. */
export async function listArchivedSitesForOrg(
  db: Database,
  orgId: string,
): Promise<ArchivedSite[]> {
  return db
    .select({ id: sites.id, url: sites.url, label: sites.label, archivedAt: sites.archivedAt })
    .from(sites)
    .where(and(eq(sites.orgId, orgId), isNotNull(sites.archivedAt)))
    .orderBy(desc(sites.archivedAt));
}

/** Sites an org is paying to monitor: scheduled and not archived. */
export async function countMonitoredSites(db: Database, orgId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(sites)
    .where(and(eq(sites.orgId, orgId), ne(sites.schedule, "off"), isNull(sites.archivedAt)));
  return row?.n ?? 0;
}

/**
 * A scan already queued or running for this site, if any. Ignores anything older
 * than 30 minutes so one stuck row can never block a site forever.
 */
export async function getInFlightScanForSite(db: Database, siteId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: scans.id })
    .from(scans)
    .where(
      and(
        eq(scans.siteId, siteId),
        sql`${scans.status} in ('queued', 'running')`,
        gte(scans.queuedAt, new Date(Date.now() - 30 * 60 * 1000)),
      ),
    )
    .limit(1);
  return row?.id ?? null;
}

function toItem(r: {
  fingerprint: string;
  vendor: string;
  title: string;
  severity: Severity;
  remediation: string;
}): DiffItem {
  return {
    fingerprint: r.fingerprint,
    vendor: r.vendor,
    title: r.title,
    severity: r.severity,
    remediation: r.remediation,
  };
}

/** The last few completed scans before this one, newest first. */
export async function findPreviousScans(
  db: Database,
  siteId: string,
  beforeScanId: string,
  limit: number,
): Promise<ScanRow[]> {
  const [current] = await db
    .select({ finishedAt: scans.finishedAt })
    .from(scans)
    .where(eq(scans.id, beforeScanId))
    .limit(1);
  if (!current?.finishedAt) return [];
  return db
    .select()
    .from(scans)
    .where(
      and(
        eq(scans.siteId, siteId),
        eq(scans.status, "complete"),
        lt(scans.finishedAt, current.finishedAt),
      ),
    )
    .orderBy(desc(scans.finishedAt))
    .limit(limit);
}

/** Site for a deploy hook token. Archived sites never match. */
export async function getSiteByDeployHookToken(
  db: Database,
  token: string,
): Promise<typeof sites.$inferSelect | undefined> {
  const [site] = await db
    .select()
    .from(sites)
    .where(and(eq(sites.deployHookToken, token), isNull(sites.archivedAt)))
    .limit(1);
  return site;
}

/** Issue a new deploy hook token. The old URL stops working immediately. */
export async function rotateDeployHookToken(
  db: Database,
  siteId: string,
  orgId: string,
): Promise<string | null> {
  const [row] = await db
    .update(sites)
    .set({
      deployHookToken: sql`replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')`,
    })
    .where(and(eq(sites.id, siteId), eq(sites.orgId, orgId)))
    .returning({ token: sites.deployHookToken });
  return row?.token ?? null;
}

export interface AlertMember {
  userId: string;
  email: string;
  role: string;
  alertsEnabled: boolean;
}

/** Every member of an org with their alert setting, for the Alerts page. */
export async function listOrgAlertSettings(db: Database, orgId: string): Promise<AlertMember[]> {
  return db
    .select({
      userId: users.id,
      email: users.email,
      role: orgMembers.role,
      alertsEnabled: orgMembers.alertsEnabled,
    })
    .from(orgMembers)
    .innerJoin(users, eq(users.id, orgMembers.userId))
    .where(eq(orgMembers.orgId, orgId))
    .orderBy(users.email);
}

/** Scoped to org and user, so one member can't change another's setting. */
export async function setAlertsEnabled(
  db: Database,
  orgId: string,
  userId: string,
  enabled: boolean,
): Promise<void> {
  await db
    .update(orgMembers)
    .set({ alertsEnabled: enabled })
    .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)));
}
